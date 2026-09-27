declare const relay: {
  fetch(request: Request, env?: { ALLOWED_ORIGINS?: string }): Promise<Response>;
};
export default relay;
