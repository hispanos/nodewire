import { Component } from "framework-mvc-nodewire";

export interface User {
  id: number;
  name: string;
  email: string;
  age: number;
}

export class UsersComponent extends Component {
  public users: User[] = [];
  public view: string = "components/users";
  public $loading: boolean = false;

  constructor(initialUsers: User[] = [], id?: string) {
    super("UsersComponent", id);
    this.users = initialUsers;
  }

  public async addUser(): Promise<void> {
    this.$loading = true;
    try {
      // Simular una operación asíncrona (como una llamada a API)
      await new Promise((res) => setTimeout(res, 2000));
      
      // Generar datos random para el nuevo usuario
      const randomId = Math.floor(Math.random() * 10000);
      const randomNames = ['Juan', 'María', 'Pedro', 'Ana', 'Carlos', 'Laura', 'Diego', 'Sofía'];
      const randomDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
      const randomName = randomNames[Math.floor(Math.random() * randomNames.length)];
      const randomDomain = randomDomains[Math.floor(Math.random() * randomDomains.length)];
      const randomAge = Math.floor(Math.random() * 50) + 18;
      
      const newUser: User = {
        id: randomId,
        name: randomName,
        email: `${randomName.toLowerCase()}${randomId}@${randomDomain}`,
        age: randomAge
      };
      
      this.users.push(newUser);
      console.log(`[NodeWire] Usuario agregado:`, newUser);
    } finally {
      this.$loading = false;
    }
  }

  public removeUser(userId: number): void {
    this.users = this.users.filter(user => user.id !== userId);
    console.log(`[NodeWire] Usuario eliminado: ${userId}`);
  }
}
