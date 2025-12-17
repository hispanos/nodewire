import { BaseController } from 'framework-mvc-nodewire';
import { CounterComponent } from '../Components/CounterComponent';
import { HeaderComponent } from '../Components/HeaderComponent';
import { UsersComponent } from '../Components/UsersComponent';

export class HomeController extends BaseController {
    // Definir los componentes que este controlador necesita
    protected static components = {
        'CounterComponent': CounterComponent,
        'HeaderComponent': HeaderComponent,
        'UsersComponent': UsersComponent
    };

    public async index() {
        // Crear múltiples componentes para usar en la vista
        const counterComponent1 = this.components.CounterComponent({ initialValue: 0 });
        const counterComponent2 = this.components.CounterComponent({ initialValue: 10 });
        const headerComponent = this.components.HeaderComponent({ 
            siteName: 'Mi Aplicación',
            currentUser: 'Usuario123'
        });
        
        // Ahora puedes pasar múltiples componentes a la vista
        // Todos estarán disponibles en el contexto de la vista
        this.render('welcome', {
            title: 'Framework MVC con NodeWire',
            users: [{name: 'Usuario1', email: 'usuario1@example.com', id: 1}, {name: 'Usuario2', email: 'usuario2@example.com', id: 2}, {name: 'Usuario3', email: 'usuario3@example.com', id: 3}],
            counterComponent1: counterComponent1,  // Primer componente
            counterComponent2: counterComponent2,  // Segundo componente
            // Puedes agregar más componentes aquí
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

    public async users() {
        // Crear componente de usuarios con algunos usuarios iniciales
        const usersComponent = this.components.UsersComponent({
            initialUsers: [
                { id: 1, name: 'Juan Pérez', email: 'juan@example.com', age: 25 },
                { id: 2, name: 'María García', email: 'maria@example.com', age: 30 }
            ]
        });
        
        const headerComponent = this.components.HeaderComponent({ 
            siteName: 'Gestión de Usuarios',
            currentUser: 'Admin'
        });
        
        this.render('users', {
            title: 'Gestión de Usuarios',
            usersComponent: usersComponent
        }, {
            layout: 'app',
            sections: {
                header: headerComponent
            }
        });
    }
}
