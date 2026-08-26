import { BrowserWindow, Menu, MenuItemConstructorOptions, shell } from 'electron';
import path from 'path';
import { isDev, appServe } from './config';
import { titleBarOptions } from '../src/lib/window-chrome';
import { DESIGNER_MENU, type DesignerMenuItem } from '../src/lib/designer-actions';

export function createMainWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        // Barra de título propia (issue #169): el buscador se muda ahí. Los CONTROLES
        // de ventana los sigue dibujando el sistema en las tres plataformas —semáforos
        // en macOS, overlay nativo en Windows/Linux—, así que un fallo nuestro nunca
        // deja la ventana sin forma de cerrarse. La decisión por plataforma vive en
        // `src/lib/window-chrome.ts`, con pruebas.
        ...titleBarOptions(process.platform),
        icon: path.join(__dirname, '..', 'assets', 'icon.png'), // Ajusta ruta
        webPreferences: {
            preload: path.join(__dirname, '..', 'preload.js'), // Ajusta ruta
            webSecurity: isDev
        },
    });

    win.webContents.session.setPermissionRequestHandler((wc, permission, cb) => cb(true));

    if (isDev) {
        // El puerto del dev server de Next es configurable: si 3000 está ocupado,
        // Next usa otro (ej. 3001) y se puede apuntar aquí con ELECTRON_RENDERER_URL.
        win.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000');
        win.webContents.openDevTools();
    } else {
        appServe(win).then(() => {
            win.loadURL("app://-");
        });
    }

    // Nunca se abre una segunda ventana de la app; pero un enlace externo
    // (el correo del autor en los créditos, docs de un proveedor de IA) sí debe
    // llegar al programa del sistema. Antes se denegaba todo y el clic no hacía
    // nada. Sólo http(s) y mailto: cualquier otro scheme (file:, etc.) se niega.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^(https?:\/\/|mailto:)/i.test(url)) shell.openExternal(url);
        return { action: "deny" };
    });
    setupMenu(win);
    return win;
}

/**
 * Abre el menú de la aplicación donde lo pida el renderer. En Windows/Linux la barra
 * de menú vivía en el marco que acabamos de ocultar: sin esto, «Archivo», «Diseño» y
 * «Ayuda» sólo quedarían accesibles por atajo.
 */
export function popupAppMenu(win: BrowserWindow, x?: number, y?: number) {
    const menu = Menu.getApplicationMenu();
    if (!menu) return;
    menu.popup({
        window: win,
        ...(typeof x === 'number' && typeof y === 'number' ? { x: Math.round(x), y: Math.round(y) } : {}),
    });
}

/** Traduce un item del catálogo al formato de Electron (recursivo por los submenús). */
function menuItem(
    item: DesignerMenuItem,
    designerAction: (action: string) => void
): MenuItemConstructorOptions {
    if (item.separator) return { type: 'separator' };
    if (item.submenu) {
        return { label: item.label, submenu: item.submenu.map((i) => menuItem(i, designerAction)) };
    }
    return {
        label: item.label,
        ...(item.accelerator ? { accelerator: item.accelerator } : {}),
        click: () => designerAction(item.id!)
    };
}

function setupMenu(win: BrowserWindow) {
    const navigateTo = (route: string) => win.webContents.send('navigate', route);
    const designerAction = (action: string) => win.webContents.send('designer-action', action);

    const template: MenuItemConstructorOptions[] = [
        {
            label: 'Archivo',
            submenu: [
                {
                    label: 'Inicio',
                    click: () => navigateTo('/')
                },
                {
                    label: 'Configuración',
                    click: () => navigateTo('/settings')
                },
                {
                    label: 'Organizar Datos',
                    click: () => navigateTo('/merger')
                },
                { type: 'separator' },
                { role: 'quit', label: 'Salir' }
            ]
        },
        {
            label: 'Diseño',
            // El menú se arma desde el catálogo ÚNICO (`src/lib/designer-actions.ts`),
            // el mismo que ofrece la barra del lienzo: una lista escrita a mano acá se
            // quedaba atrás en cuanto la barra ganaba una acción (issue #171).
            submenu: DESIGNER_MENU.map((item) => menuItem(item, designerAction))
        },
        {
            label: 'Vista',
            submenu: [
                { role: 'reload', label: 'Recargar' },
                { role: 'forceReload', label: 'Forzar recarga' },
                { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
                { type: 'separator' },
                { role: 'resetZoom', label: 'Zoom normal' },
                { role: 'zoomIn', label: 'Acercar' },
                { role: 'zoomOut', label: 'Alejar' }
            ]
        },
        {
            label: 'Editar',
            submenu: [
                { role: 'undo', label: 'Deshacer' },
                { role: 'redo', label: 'Rehacer' },
                { type: 'separator' },
                { role: 'cut', label: 'Cortar' },
                { role: 'copy', label: 'Copiar' },
                { role: 'paste', label: 'Pegar' },
                { role: 'delete', label: 'Eliminar' },
                { type: 'separator' },
                { role: 'selectAll', label: 'Seleccionar todo' }
            ]
        },
        {
            label: 'Ayuda',
            submenu: [
                {
                    label: 'Guía MCP (diseñar con Claude Code)',
                    click: () => navigateTo('/mcp')
                },
                { type: 'separator' },
                {
                    // Documentación IN-APP: explica el lienzo y los componentes
                    // gráficos de cada notación (antes abría una URL externa).
                    label: 'Documentación',
                    click: () => navigateTo('/docs')
                }
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}