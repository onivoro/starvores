export class AppServerBucketvoreConfig {
    AWS_PROFILE?: string = process.env['AWS_PROFILE'] || 'default';
    HTTP_PORT?: string = process.env['HTTP_PORT'] || '3007';
}
