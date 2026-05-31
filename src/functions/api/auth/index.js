export async function onRequestGet(context) {
  const { env } = context;
  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set('scope', 'repo');

  return Response.redirect(githubAuthUrl.toString(), 302);
}