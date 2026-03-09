import { appRoutes } from './app.routes';

describe('appRoutes', () => {
  it('should have a login route', () => {
    const loginRoute = appRoutes.find(r => r.path === 'login');
    expect(loginRoute).toBeTruthy();
    expect(loginRoute!.loadComponent).toBeDefined();
  });

  it('should have a chat route', () => {
    const chatRoute = appRoutes.find(r => r.path === 'chat');
    expect(chatRoute).toBeTruthy();
    expect(chatRoute!.loadComponent).toBeDefined();
  });

  it('should redirect empty path to /chat', () => {
    const defaultRoute = appRoutes.find(r => r.path === '');
    expect(defaultRoute).toBeTruthy();
    expect(defaultRoute!.redirectTo).toBe('/chat');
    expect(defaultRoute!.pathMatch).toBe('full');
  });

  it('should redirect wildcard to /chat', () => {
    const wildcardRoute = appRoutes.find(r => r.path === '**');
    expect(wildcardRoute).toBeTruthy();
    expect(wildcardRoute!.redirectTo).toBe('/chat');
  });

  it('should lazy-load LoginComponent', async () => {
    const loginRoute = appRoutes.find(r => r.path === 'login');
    const component = await (loginRoute!.loadComponent as () => Promise<any>)();
    // loadComponent resolves to the component class directly (via .then(m => m.LoginComponent))
    expect(component).toBeDefined();
    expect(typeof component).toBe('function');
  });

  it('should lazy-load ChatComponent', async () => {
    const chatRoute = appRoutes.find(r => r.path === 'chat');
    const component = await (chatRoute!.loadComponent as () => Promise<any>)();
    expect(component).toBeDefined();
    expect(typeof component).toBe('function');
  });
});
