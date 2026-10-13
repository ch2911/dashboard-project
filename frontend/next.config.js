/** @type {import('next').NextConfig} */

// The CI workflow sets PAGES_BASE_PATH (e.g. "/dashboard-project") because GitHub Pages
// serves the site from https://<user>.github.io/<repo>/. Locally and in the desktop app it
// is empty, so the site is served from the root as before.
const basePath = process.env.PAGES_BASE_PATH || '';

const nextConfig = {
    output: 'export',
    basePath,
    // Export each page as page/index.html so refreshing any URL works on static hosting
    trailingSlash: true,
};

module.exports = nextConfig;
