import { Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useT, type MessageKey } from '../i18n'
import { hapticsSupported, sound as feedbackSound, unlockAudio } from '../platform/feedback'
import { useSettings, type Lang, type PivotColor, type PivotMode, type ReaderFont, type ReadMode, type ThemeName } from '../state/settings'
import { Segmented, Sheet, Switch } from '../ui/primitives'
import { WordDisplay } from './reader/WordDisplay'

const THEMES: ThemeName[] = ['system', 'light', 'dark', 'sepia']
const THEME_SWATCH: Record<ThemeName, [string, string]> = {
  system: ['linear-gradient(135deg, #f4f5f7 50%, #0e1014 50%)', '#14161b'],
  light: ['#f4f5f7', '#14161b'],
  dark: ['#0e1014', '#e7e9ed'],
  sepia: ['#f1e7d3', '#3a2e21'],
}
const PIVOTS: PivotColor[] = ['coral', 'blue', 'green', 'violet', 'ink']

function Row({ label, desc, htmlFor, children }: { label: string; desc?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <label htmlFor={htmlFor} className="min-w-0">
        <div className="font-semibold">{label}</div>
        {desc && <div className="text-sm text-muted">{desc}</div>}
      </label>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-4 border-b border-line last:border-b-0">
      <h3 className="label m-0 mb-3">{title}</h3>
      {children}
    </section>
  )
}

export function SettingsPanel({ onClose, showPreview = true }: { onClose: () => void; showPreview?: boolean }) {
  const t = useT()
  const s = useSettings()

  return (
    <Sheet title={t('settings.title')} onClose={onClose} id="settings">
      {showPreview && (
        <div className="rounded-xl bg-bg border border-line px-2 py-1 mb-2" style={{ ['--word-size' as string]: '2.5rem' }}>
          <WordDisplay word="Spubber" font={s.font} scale={s.wordScale} guides={s.guides} />
        </div>
      )}

      <Section title={t('settings.theme')}>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('settings.theme')}>
          {THEMES.map((th) => (
            <button
              key={th}
              role="radio"
              aria-checked={s.theme === th}
              onClick={() => s.set({ theme: th })}
              className="grid gap-1.5 justify-items-center p-1.5 rounded-xl border-0 bg-transparent"
            >
              <span
                className="w-12 h-12 rounded-full grid place-items-center font-serif font-bold text-lg"
                style={{
                  background: THEME_SWATCH[th][0],
                  color: THEME_SWATCH[th][1],
                  boxShadow: s.theme === th ? '0 0 0 2px var(--bg), 0 0 0 4px var(--fg)' : '0 0 0 1px var(--line)',
                }}
              >
                {th === 'system' ? '' : 'Aa'}
              </span>
              <span className={`text-xs ${s.theme === th ? 'font-bold' : 'text-muted'}`}>{t(`settings.theme.${th}`)}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('settings.font')}>
        <Segmented<ReaderFont>
          label={t('settings.font')}
          value={s.font}
          onChange={(font) => s.set({ font })}
          options={[
            { value: 'serif', label: <span className="font-serif">{t('settings.font.serif')}</span> },
            { value: 'sans', label: <span className="font-ui">{t('settings.font.sans')}</span> },
            { value: 'mono', label: <span className="font-mono">{t('settings.font.mono')}</span> },
          ]}
        />
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <label htmlFor="word-scale" className="font-semibold">
              {t('settings.size')}
            </label>
            <span className="text-muted tabular">{Math.round(s.wordScale * 100)} %</span>
          </div>
          <input
            id="word-scale"
            className="range"
            type="range"
            min={0.7}
            max={1.6}
            step={0.05}
            value={s.wordScale}
            style={{ ['--fill' as string]: `${((s.wordScale - 0.7) / 0.9) * 100}%` }}
            onChange={(e) => s.set({ wordScale: Number(e.target.value) })}
          />
        </div>
        <div className="mt-4">
          <div className="text-sm font-semibold mb-2">{t('settings.pivot')}</div>
          <div className="flex gap-3" role="radiogroup" aria-label={t('settings.pivot')}>
            {PIVOTS.map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={s.pivot === p}
                aria-label={p}
                onClick={() => s.set({ pivot: p })}
                className="w-9 h-9 rounded-full border-0"
                style={{
                  background: `var(--pivot-${p})`,
                  boxShadow: s.pivot === p ? '0 0 0 2px var(--surface), 0 0 0 4px var(--fg)' : 'none',
                }}
              />
            ))}
          </div>
        </div>
        <div className="mt-4">
          <div className="text-sm font-semibold mb-2">{t('settings.pivotMode')}</div>
          <Segmented<PivotMode>
            label={t('settings.pivotMode')}
            value={s.pivotMode}
            onChange={(pivotMode) => s.set({ pivotMode })}
            options={[
              { value: 'orp', label: t('settings.pivotMode.orp') },
              { value: 'center', label: t('settings.pivotMode.center') },
            ]}
          />
          <p className="text-sm text-muted mt-2 mb-0">{t(s.pivotMode === 'orp' ? 'settings.pivotMode.orp.desc' : 'settings.pivotMode.center.desc')}</p>
        </div>
        <Row label={t('settings.guides')} htmlFor="guides">
          <Switch id="guides" label={t('settings.guides')} checked={s.guides} onChange={(guides) => s.set({ guides })} />
        </Row>
      </Section>

      <Section title={t('settings.mode')}>
        <Segmented<ReadMode>
          label={t('settings.mode')}
          value={s.mode}
          onChange={(mode) => s.set({ mode })}
          options={[
            { value: 'hold', label: t('settings.mode.hold') },
            { value: 'tap', label: t('settings.mode.tap') },
            { value: 'scroll', label: t('settings.mode.scroll') },
            { value: 'gesture', label: t('settings.mode.gesture') },
          ]}
        />
        <p className="text-sm text-muted mt-2 mb-0">{t(`settings.mode.${s.mode}.desc` as MessageKey)}</p>
        <Row label={t('settings.hints')} desc={t('settings.hints.desc')} htmlFor="hints">
          <Switch id="hints" label={t('settings.hints')} checked={s.hints} onChange={(hints) => s.set({ hints })} />
        </Row>
        <Row label={t('settings.smartPauses')} desc={t('settings.smartPauses.desc')} htmlFor="smart">
          <Switch id="smart" label={t('settings.smartPauses')} checked={s.smartPauses} onChange={(smartPauses) => s.set({ smartPauses })} />
        </Row>
        <Row label={t('settings.context')} htmlFor="ctx">
          <Switch id="ctx" label={t('settings.context')} checked={s.contextOnPause} onChange={(contextOnPause) => s.set({ contextOnPause })} />
        </Row>
        <Row label={t('settings.rewind')} desc={t('settings.rewind.desc')}>
          <div className="flex items-center gap-1 flex-none">
            <button className="icon-btn" aria-label="−" onClick={() => s.set({ rewindWords: Math.max(0, s.rewindWords - 1) })} disabled={s.rewindWords <= 0}>
              <Minus size={16} />
            </button>
            <span className="tabular w-6 text-center font-semibold">{s.rewindWords}</span>
            <button className="icon-btn" aria-label="+" onClick={() => s.set({ rewindWords: Math.min(10, s.rewindWords + 1) })} disabled={s.rewindWords >= 10}>
              <Plus size={16} />
            </button>
          </div>
        </Row>
      </Section>

      <Section title={t('settings.feedback')}>
        {hapticsSupported() && (
          <Row label={t('settings.haptics')} desc={t('settings.haptics.desc')} htmlFor="haptics">
            <Switch id="haptics" label={t('settings.haptics')} checked={s.haptics} onChange={(haptics) => s.set({ haptics })} />
          </Row>
        )}
        <Row label={t('settings.sound')} desc={t('settings.sound.desc')} htmlFor="sound">
          <Switch
            id="sound"
            label={t('settings.sound')}
            checked={s.sound}
            onChange={(sound) => {
              s.set({ sound })
              if (sound) {
                // The toggle itself is a user gesture: unlock audio and play a sample.
                unlockAudio()
                setTimeout(() => feedbackSound.page(), 60)
              }
            }}
          />
        </Row>
      </Section>

      <Section title={t('settings.language')}>
        <Segmented<Lang>
          label={t('settings.language')}
          value={s.lang}
          onChange={(lang) => s.set({ lang })}
          options={[
            { value: 'auto', label: t('settings.language.auto') },
            { value: 'es', label: 'Español' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Section>
    </Sheet>
  )
}
