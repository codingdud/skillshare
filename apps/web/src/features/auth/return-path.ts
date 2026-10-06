export function returnPath(value: string | null) {
  return value &&
    (value.startsWith('/device?') ||
      ['/admin', '/profile', '/profile/edit'].some(
        (path) => value === path || value.startsWith(path + '?'),
      )) &&
    !/[\\\x00-\x1f\x7f]/.test(value)
    ? value
    : '/harnesses';
}
