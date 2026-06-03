export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('Missing code parameter', { status: 400 });
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return new Response(`OAuth error: ${tokenData.error_description}`, { status: 400 });
    }

    const token = tokenData.access_token;
    const provider = 'github';
    const message = JSON.stringify({ token, provider });

    const html = '<!DOCTYPE html><html><body><script>(function() {'
      + 'var token = ' + JSON.stringify(token) + ';'
      + 'var provider = "github";'
      + 'var msg = "authorization:" + provider + ":success:" + JSON.stringify({ token: token, provider: provider });'
      + 'function send() {'
      + '  if (window.opener) {'
      + '    window.opener.postMessage(msg, "*");'
      + '    setTimeout(function() { window.close(); }, 1000);'
      + '  }'
      + '}'
      + 'send();'
      + 'window.addEventListener("message", send, false);'
      + '})();<\/script></body></html>';

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Security-Policy': "script-src 'unsafe-inline'",
      },
    });

  } catch (err) {
    return new Response(`Server error: ${err.message}`, { status: 500 });
  }
}