export class AppServerDatavoreConfig {
    host: string = process.env['DV_HOST']!;
    port: string = process.env['DV_PORT']!;
    username: string = process.env['DV_USER']!;
    password: string = process.env['DV_PASSWORD']!;
    database: string = process.env['DV_DB']!;
    type: any = process.env['DV_TYPE']!;
}