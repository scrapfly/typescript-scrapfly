export function urlsafe_b64encode(data: string): string {
    return Buffer.from(data, 'utf-8').toString('base64')
        .replace(/\+/g, '-')  // Replace all instances of '+' with '-'
        .replace(/\//g, '_')  // Replace all instances of '/' with '_'
        .replace(/=+$/, '');  // Remove trailing '=' characters
}
