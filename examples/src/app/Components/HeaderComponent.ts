import { Component } from 'framework-mvc-nodewire';

export class HeaderComponent extends Component {
    public siteName: string = 'Mi Aplicación';
    public currentUser: string | null = null;

    constructor(siteName?: string, currentUser?: string, id?: string) {
        super('HeaderComponent', id);
        if (siteName) this.siteName = siteName;
        if (currentUser) this.currentUser = currentUser;
    }

    public render(templateEngine: any): string {
        return templateEngine.render('components/header', { component: this });
    }
}
