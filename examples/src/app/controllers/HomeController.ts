import { BaseController } from 'framework-mvc-nodewire';
import { CounterComponent } from '../Components/CounterComponent';

export class HomeController extends BaseController {
    // Definir los componentes que este controlador necesita
    protected static components = {
        'CounterComponent': CounterComponent
    };

    public async index() {
        // Acceder directamente a los componentes con argumentos nombrados
        const counterComponent = this.components.CounterComponent({ initialValue: 0 });
        
        this.render('welcome', {
            title: 'Framework MVC con NodeWire',
            counterComponent: counterComponent
        });
    }
}
