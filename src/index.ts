import { Application } from './core/Application';
import { Router } from './core/Router';
import { CounterComponent } from './app/Components/CounterComponent';

// Crear instancia de la aplicación
const app = new Application();

// Registrar componentes NodeWire
const nodeWireManager = app.getNodeWireManager();
nodeWireManager.registerComponent('CounterComponent', CounterComponent);

// Configurar rutas
const router = new Router();

// Ruta de ejemplo
router.get('/', (req, res) => {
    // Crear una instancia del componente Counter
    const counterComponent = nodeWireManager.createComponent('CounterComponent', 0);
    
    res.render('welcome', { 
        title: 'Framework MVC con NodeWire',
        counterComponent: counterComponent
    });
});

// Registrar rutas en la aplicación
app.use(router);

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

