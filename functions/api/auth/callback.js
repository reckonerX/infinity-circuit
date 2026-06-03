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

    const script = `
<!DOCTYPE html>
const script = `
<!DOCTYPE html>
<html>
<body>
<script>
(function() {
  var token = ${JSON.stringify(tokenData.access_token)};
  var provider = 'github';
  
  function attemptPostMessage() {
    if (window.opener) {
      window.opener.postMessage(
        'authorization:' + provider + ':success:' + JSON.stringify({ token: token, provider: provider }),
        '*'
      );
      setTimeout(function() { window.close(); }, 1000);
    } else {
      // Fallback: store in localStorage for the CMS to pick up
      localStorage.setItem('netlify-cms-auth', JSON.stringify({ token: token, provider: provider }));
      document.body.innerHTML = '<p style="font-family:sans-serif;padding:2rem;">Authenticated. You can close this window.</p>';
    }
  }
  
  attemptPostMessage();
  window.addEventListener('message', function(e) {
    attemptPostMessage();
  }, false);
})();
<\/script>
</body>
</html>`;

    return new Response(script, {
  headers: { 
    'Content-Type': 'text/html',
    'Content-Security-Policy': "script-src 'unsafe-inline'",
  },
});
  } catch (err) {
    return new Response(`Server error: ${err.message}`, { status: 500 });
  }
}