import axios from 'axios';

// create an axios instance that talks to our backend
// since we have a vite proxy, we can just use /api as the base url
const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // so cookies (refresh token) are sent automatically
});

// before every request, attach the access token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ────────────────────────────────────────────────────────────────────
// RESPONSE INTERCEPTOR — handles what happens when a request FAILS
//
// the big idea:
//   access tokens expire after 15 min. when that happens, the backend
//   sends back a 401 (unauthorized). instead of logging the user out,
//   we silently ask for a new access token using the refresh token
//   (which lives in a httpOnly cookie), and then RETRY the original
//   request like nothing happened. the user never notices.
//
// the tricky part:
//   what if 3 requests fail at the same time with 401?
//   we dont want to call /auth/refresh 3 times. so we use a queue:
//   the first one calls refresh, the other 2 wait in line. once we
//   get the new token, all 3 requests get retried.
// ────────────────────────────────────────────────────────────────────

// flag to track if we're already in the middle of refreshing
let isRefreshing = false;

// if multiple requests fail while we're refreshing, they wait here
let failedQueue = [];

// once refreshing is done, go through the queue and either
// retry them all with the new token, or reject them all if refresh failed
const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  // if the request succeeded, just pass the response through, nothing to do
  (response) => response,

  // if the request failed, this function runs
  async (error) => {
    const originalRequest = error.config;

    // STEP 1: check if the error is a 401 (meaning token expired or invalid)
    //         also check _retry so we dont get stuck in an infinite loop
    if (error.response?.status === 401 && !originalRequest._retry) {

      // STEP 2: if the /auth/refresh endpoint itself returned 401,
      //         that means even the refresh token is dead — give up
      if (originalRequest.url === '/auth/refresh') {
        return Promise.reject(error);
      }

      // STEP 3: if another request is already refreshing the token,
      //         dont call refresh again — just wait in line
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      // STEP 4: we're the first one here, lets do the refresh
      originalRequest._retry = true;  // mark it so we dont retry forever
      isRefreshing = true;

      try {
        // ask the backend for a new access token using the refresh cookie
        const { data } = await api.post('/auth/refresh');
        const newToken = data.accessToken;

        // save the new token
        localStorage.setItem('accessToken', newToken);

        // let all the queued requests know we got a new token
        processQueue(null, newToken);

        // retry the original request that failed with the new token
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // refresh failed too — the user needs to login again
        processQueue(refreshError, null);
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // if it wasnt a 401, just pass the error through normally
    return Promise.reject(error);
  }
);

export default api;
