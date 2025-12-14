import { Application, Router, BaseController } from 'framework-mvc-nodewire';
import { HomeController } from './app/controllers/HomeController';

// Crear instancia de la aplicación (sin configuración, usa valores por defecto)
// Valores por defecto:
// - views: resources/views
// - controllers: app/controllers
// - models: app/models
// - public: public
const app = new Application();

// Crear instancia del controlador con Proxy
// Los componentes se registran automáticamente desde el controlador
const nodeWireManager = app.getNodeWireManager();
const homeController = BaseController.createProxy(new HomeController(), nodeWireManager);

// Configurar rutas - ahora es súper simple!
const router = new Router();
// Ahora puedes usar controller.method directamente!
router.get('/', homeController.index);

// Registrar rutas en la aplicación
app.use(router);

// Iniciar servidor
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
