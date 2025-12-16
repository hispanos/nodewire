import { BaseController } from 'framework-mvc-nodewire';
import { CounterComponent } from '../Components/CounterComponent';
import { HeaderComponent } from '../Components/HeaderComponent';

export class HomeController extends BaseController {
    // Definir los componentes que este controlador necesita
    protected static components = {
        'CounterComponent': CounterComponent,
        'HeaderComponent': HeaderComponent
    };

    public async index() {
        // Acceder directamente a los componentes con argumentos nombrados
        const counterComponent = this.components.CounterComponent({ initialValue: 0 });
        
        // Usar el sistema de secciones dinámicas
        // Puedes pasar cualquier sección personalizada
        // this.render('welcome', {
        //     title: 'Framework MVC con NodeWire',
        //     counterComponent: counterComponent
        // }, {
        //     layout: 'app',
        //     sections: {
        //         header: 'partials/header',  // Vista partial para el header
        //         footer: 'partials/footer', // Vista partial para el footer
        //         // sidebar: sidebarComponent,  // Ejemplo: puedes agregar cualquier sección
        //         // topBar: 'partials/topbar',  // Ejemplo: otra sección personalizada
        //     }
        // });
        
        // Ejemplo: Usar componentes NodeWire en las secciones
        const headerComponent = this.components.HeaderComponent({ 
            siteName: 'Mi Aplicación',
            currentUser: 'Usuario123'
        });
        this.render('welcome', {
            title: 'Framework MVC con NodeWire',
            counterComponent: counterComponent
        }, {
            layout: 'app',
            sections: {
                header: headerComponent,  // Componente NodeWire para el header
                footer: 'partials/footer'  // Vista partial para el footer
            }
        });
        
        // Ejemplo: Layout personalizado (admin) con secciones personalizadas
        // this.render('admin-dashboard', {
        //     title: 'Dashboard',
        //     stats: { users: 100, posts: 50 }
        // }, {
        //     layout: 'admin',
        //     sections: {
        //         topbar: 'partials/admin-topbar',    // Topbar personalizado
        //         sidebar: 'partials/admin-sidebar',   // Sidebar personalizado
        //         footer: 'partials/footer'            // Footer
        //     }
        // });
    }

    public async testBlade() {
        // Probar el motor Blade
        this.renderBlade('test', {
            title: 'Test del Motor Blade',
            message: '¡Funciona correctamente!',
            number: 42,
            showMessage: true,
            htmlContent: '<strong>Este es HTML sin escape</strong>',
            example: {example1: 'example1', example2: 'example2'},
            data: {test: 'test', test2: 'test2'}
        });
    }
}
