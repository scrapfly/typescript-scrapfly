export function urlsafe_b64encode(data: string): string {
    return Buffer.from(data, 'utf-8')
        .toString('base64')
        .replace('+', '-')
        .replace('/', '_')
        .replace(/=+$/, '');
}