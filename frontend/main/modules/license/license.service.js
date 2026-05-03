import crypto from 'node:crypto'

/**
 * @param {ReturnType<typeof import('./license.repository.js').createLicenseRepository>} repo
 * @param {ReturnType<typeof import('../settings/settings.service.js').createSettingsService>} settings
 */
export function createLicenseService(repo, settings) {
  return {
    isActivated() {
      return settings.get('is_activated') === true
    },

    activate(token) {
      if (!token?.trim()) {
        throw Object.assign(new Error('Token requerido'), { code: 'LICENSE_EMPTY' })
      }
      const hash = crypto.createHash('sha256').update(token.trim()).digest('hex')
      const row  = repo.findValidToken(hash)

      if (!row) {
        throw Object.assign(
          new Error('Token inválido o ya utilizado'),
          { code: 'LICENSE_INVALID' }
        )
      }

      repo.burnToken(row.id)
      settings.set('is_activated', true)
      return { activated: true }
    },
  }
}
