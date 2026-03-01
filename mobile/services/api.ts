import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Replace YOUR_LOCAL_IP with your machine's local IP address when running on a physical device.
// e.g., 'http://192.168.1.100:8000/api/v1'
// If running in an Android emulator, 'http://10.0.2.2:8000/api' usually works for localhost.
const BASE_URL = 'http://192.168.232.72:8000/api';

const api = axios.create({
    baseURL: BASE_URL,
});

// Add a request interceptor to inject the auth token
api.interceptors.request.use(
    async (config) => {
        const token = await AsyncStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add a response interceptor to handle unauthorized errors
api.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        if (error.response && error.response.status === 401) {
            // Clear token and handle logout
            await AsyncStorage.removeItem('token');
            // Redirect to login or dispatch action depending on architecture
        }
        return Promise.reject(error);
    }
);

export default api;
