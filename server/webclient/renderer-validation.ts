const root = `${import.meta.dir}/out/renderer-validation`;
const port = Number(process.env.PORT || 8890);

function contentType(pathname: string): string {
    if (pathname.endsWith('.js')) {
        return 'application/javascript';
    }
    if (pathname.endsWith('.map')) {
        return 'application/json';
    }
    return 'text/html';
}

Bun.serve({
    port,
    async fetch(req) {
        const url = new URL(req.url);
        const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
        const file = Bun.file(`${root}${pathname}`);
        if (!(await file.exists())) {
            return new Response('not found', { status: 404 });
        }
        return new Response(file, {
            headers: {
                'content-type': contentType(pathname)
            }
        });
    }
});

console.log(`Renderer validation server: http://localhost:${port}/`);
