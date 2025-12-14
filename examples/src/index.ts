import { Application, Router } from 'framework-mvc-nodewire';
import { CounterComponent } from './app/Components/CounterComponent';
import path from 'node:path';

// Crear instancia de la aplicación con configuración
const app = new Application({
    viewsPath: path.join(__dirname, '../resources/views'),
    publicPath: path.join(__dirname, '../public'),
    staticPath: path.join(__dirname, '../public')
});

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
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

