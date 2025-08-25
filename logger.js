export const log = {
  info:  (...args) => console.log(new Date().toISOString(), 'INFO ', ...args),
  warn:  (...args) => console.warn(new Date().toISOString(), 'WARN ', ...args),
  error: (...args) => console.error(new Date().toISOString(), 'ERROR', ...args)
};
