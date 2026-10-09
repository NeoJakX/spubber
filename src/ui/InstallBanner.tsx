import { Download, Share, SquarePlus, X } from 'lucide-react'
import { useT } from '../i18n'
import { installBannerKind, useInstall } from '../platform/webapp'

/**
 * Invitation to install the web app: step-by-step on iPhone (Safari has no
 * install button), a one-tap button where the browser offers a prompt.
 */
export function InstallBanner() {
  const t = useT()
  const state = useInstall()
  const kind = installBannerKind(state)
  if (!kind) return null

  return (
    <section
      className="relative rounded-[var(--radius)] border border-line bg-surface p-4 pr-12 flex gap-4 items-start"
      aria-labelledby="install-title"
      data-testid="install-banner"
      data-kind={kind}
    >
      <img src="./icons/apple-touch-icon.png" alt="" width={48} height={48} className="rounded-xl flex-none" />
      <div className="min-w-0">
        <h2 id="install-title" className="m-0 text-base font-bold">
          {t(kind === 'ios' ? 'install.ios.title' : 'install.prompt.title')}
        </h2>
        {kind === 'ios' ? (
          <>
            <ol className="m-0 mt-2 p-0 list-none grid gap-1.5 text-sm">
              <li className="grid grid-cols-[1rem_1fr] gap-2">
                <span className="font-bold tabular">1</span>
                <span>
                  {t('install.ios.step1')}{' '}
                  <Share size={16} aria-hidden="true" className="inline align-[-3px] text-[var(--pivot-blue)]" />
                </span>
              </li>
              <li className="grid grid-cols-[1rem_1fr] gap-2">
                <span className="font-bold tabular">2</span>
                <span>
                  {t('install.ios.step2')}{' '}
                  <SquarePlus size={16} aria-hidden="true" className="inline align-[-3px]" />
                </span>
              </li>
            </ol>
            <p className="m-0 mt-2 text-sm text-muted">{t('install.ios.body')}</p>
          </>
        ) : (
          <>
            <p className="m-0 mt-1 text-sm text-muted">{t('install.prompt.body')}</p>
            <button className="btn btn-primary mt-3 h-9" onClick={() => void state.install()}>
              <Download size={16} />
              {t('install.prompt.action')}
            </button>
          </>
        )}
      </div>
      <button className="icon-btn absolute top-2 right-2" onClick={state.dismiss} aria-label={t('install.dismiss')} title={t('install.dismiss')}>
        <X size={18} />
      </button>
    </section>
  )
}
