import { appRoutes } from './app.routes';

describe('appRoutes', () => {
  it('should have a login route', () => {
    const loginRoute = appRoutes.find(r => r.path === 'login');
    expect(loginRoute).toBeTruthy();
    expect(loginRoute!.loadComponent).toBeDefined();
  });

  it('should have a layout route with auth guard', () => {
    const layoutRoute = appRoutes.find(r => r.path === '');
    expect(layoutRoute).toBeTruthy();
    expect(layoutRoute!.loadComponent).toBeDefined();
    expect(layoutRoute!.canActivate).toBeDefined();
    expect(layoutRoute!.canActivate!.length).toBe(1);
  });

  it('should have chat as child of layout', () => {
    const layoutRoute = appRoutes.find(r => r.path === '');
    expect(layoutRoute!.children).toBeDefined();
    const chatRoute = layoutRoute!.children!.find(r => r.path === 'chat');
    expect(chatRoute).toBeTruthy();
    expect(chatRoute!.loadComponent).toBeDefined();
  });

  it('should redirect wildcard to empty path', () => {
    const wildcardRoute = appRoutes.find(r => r.path === '**');
    expect(wildcardRoute).toBeTruthy();
    expect(wildcardRoute!.redirectTo).toBe('');
  });

  it('should lazy-load LoginComponent', async () => {
    const loginRoute = appRoutes.find(r => r.path === 'login');
    const component = await (loginRoute!.loadComponent as () => Promise<any>)();
    expect(component).toBeDefined();
    expect(typeof component).toBe('function');
  });
});
