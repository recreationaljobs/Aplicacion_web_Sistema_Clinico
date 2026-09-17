import config from '../src/frontend/vite.config.js'

// Fixed loopback ports match the disposable release-smoke profile.
export default {
  ...config,
  preview: { proxy: { '/api/': { target: 'http://127.0.0.1:8190' } } },
}
