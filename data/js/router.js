/**
 * Router.js - Hash-based SPA Router for CTN Dashboard
 * Handles navigation between pages without server round trips
 */

class Router {
    constructor() {
        this.routes = new Map();
        this.currentRoute = null;
        this.currentParams = {};
        this.beforeHooks = [];
        this.afterHooks = [];
        this._boundHandleHashChange = this._handleHashChange.bind(this);

        // Listen for hash changes
        window.addEventListener('hashchange', this._boundHandleHashChange);
        window.addEventListener('load', this._boundHandleHashChange);
    }

    //--------------------------------------------------
    // Route Registration
    //--------------------------------------------------
    add(path, handler) {
        // Convert path pattern to regex
        // :param -> named capture group
        // * -> match anything (including slashes)
        const pattern = path
            .replace(/\:([^\/]+)/g, '(?<$1>[^\/]+)')
            .replace(/\*/g, '(?<splat>.*)');

        const regex = new RegExp(`^${pattern}$`);
        this.routes.set(path, { regex, handler, pattern: path });
        return this;
    }

    // Navigation guards
    beforeEach(hook) {
        this.beforeHooks.push(hook);
    }

    afterEach(hook) {
        this.afterHooks.push(hook);
    }

    //--------------------------------------------------
    // Navigation
    //--------------------------------------------------
    navigate(path, replace = false) {
        if (replace) {
            history.replaceState(null, '', `#${path}`);
        } else {
            location.hash = path;
        }
    }

    back() {
        history.back();
    }

    //--------------------------------------------------
    // Hash Change Handler
    //--------------------------------------------------
    async _handleHashChange() {
        const hash = location.hash.slice(1) || '/';
        await this._matchRoute(hash);
    }

    async _matchRoute(hash) {
        for (const [path, route] of this.routes) {
            const match = hash.match(route.regex);
            if (match) {
                const params = match.groups || {};
                const oldRoute = this.currentRoute;

                // Run before hooks
                for (const hook of this.beforeHooks) {
                    const result = await hook({ path: hash, params, route: route.pattern, oldRoute });
                    if (result === false) {
                        // Navigation cancelled
                        if (oldRoute) {
                            location.hash = oldRoute.path || '/';
                        }
                        return;
                    }
                    if (typeof result === 'string') {
                        // Redirect
                        location.hash = result;
                        return;
                    }
                }

                this.currentRoute = { path: hash, params, route: route.pattern };
                this.currentParams = params;

                try {
                    await route.handler(params, hash);
                } catch (e) {
                    console.error('Route handler error:', e);
                    this.navigate('/error');
                    return;
                }

                // Run after hooks
                for (const hook of this.afterHooks) {
                    await hook({ path: hash, params, route: route.pattern });
                }

                return;
            }
        }

        // No route matched - 404
        console.warn('No route matched:', hash);
        this.navigate('/404');
    }

    //--------------------------------------------------
    // Helpers
    //--------------------------------------------------
    getCurrentRoute() {
        return this.currentRoute;
    }

    getParams() {
        return { ...this.currentParams };
    }

    getParam(name) {
        return this.currentParams[name] || null;
    }

    destroy() {
        window.removeEventListener('hashchange', this._boundHandleHashChange);
        this.routes.clear();
        this.beforeHooks = [];
        this.afterHooks = [];
    }
}

// Singleton instance
const router = new Router();

// Default 404 handler
router.add('/404', () => {
    document.body.innerHTML = `
        <div class="page error-page">
            <div class="error-container">
                <h1>404</h1>
                <p>Page not found</p>
                <a href="#/dashboard" class="btn btn-primary">Go to Dashboard</a>
            </div>
        </div>
    `;
});

//--------------------------------------------------
// Export
//--------------------------------------------------
export default router;
export { Router };