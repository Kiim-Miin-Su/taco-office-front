function isActiveRoute(pathname: string, href: string) {
  return href === "/"
    ? pathname === href
    : pathname.startsWith(`${href}/`) || pathname === href;
}

export default isActiveRoute;
