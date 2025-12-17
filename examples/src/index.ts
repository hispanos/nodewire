import { Application, Router } from 'framework-mvc-nodewire';
import { HomeController } from './app/controllers/HomeController';

// Crear instancia de la aplicación (sin configuración, usa valores por defecto)
// Valores por defecto:
// - views: resources/views
// - controllers: app/controllers
// - models: app/models
// - public: public
const app = new Application();

// Configurar rutas - ahora es súper simple!
const router = new Router();
// Solo necesitas pasar la clase del controlador y el nombre del método
// El Router se encarga de todo: crear instancia, registrar componentes, hacer bind
router.get('/', HomeController, 'index');
router.get('/test-blade', HomeController, 'testBlade');
router.get('/users', HomeController, 'users');

// Registrar rutas en la aplicación
app.use(router);

// Iniciar servidor
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
