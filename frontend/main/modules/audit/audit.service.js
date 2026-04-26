/**
 * @param {ReturnType<typeof import('./audit.repository.js').createAuditRepository>} repo
 */
export function createAuditService(repo) {
  return {
    /**
     * @param {import('./audit.repository.js').AuditEntry} entry
     */
    log(entry) {
      repo.log(entry)
    },

    /**
     * @param {{ page?: number, pageSize?: number, action?: string, entity?: string, from?: string, to?: string }} opts
     */
    list(opts = {}) {
      return repo.findPage(opts)
    },
  }
}
