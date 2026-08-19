REVOKE ALL ON FUNCTION public.manages_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manages_owner(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.manages_owner(uuid) TO authenticated, service_role;