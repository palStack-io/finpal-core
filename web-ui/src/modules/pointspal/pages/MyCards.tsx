import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Pencil, Trash2, Plus, Search, X, CheckCircle, ExternalLink, ChevronDown } from 'lucide-react';
import { pointspalService, WalletCard, CardTransaction, Program } from '../service';
import CardFace from '../components/CardFace';
import { Loading } from '../../../components/common/Loading';
import { ScopeTag } from '../../../components/ScopeTag';

// ── Common category slugs shown for manual earn-rate entry ───────────────────

const COMMON_CATEGORIES = [
  { slug: 'dining',          label: 'Dining' },
  { slug: 'groceries',       label: 'Groceries' },
  { slug: 'gas',             label: 'Gas' },
  { slug: 'travel_portal',   label: 'Travel (Portal)' },
  { slug: 'flights_direct',  label: 'Flights (Direct)' },
  { slug: 'hotels_direct',   label: 'Hotels (Direct)' },
  { slug: 'streaming',       label: 'Streaming' },
  { slug: 'transit',         label: 'Transit / Rideshare' },
  { slug: 'online_shopping', label: 'Online Shopping' },
  { slug: 'phone_internet',  label: 'Phone / Internet' },
  { slug: 'drugstores',      label: 'Drugstores' },
  { slug: 'entertainment',   label: 'Entertainment' },
];

// ── Card Edit / Add Modal ─────────────────────────────────────────────────────

interface CardEditModalProps {
  card: WalletCard | null; // null = adding new
  onSave: () => void;
  onCancel: () => void;
}

const CardEditModal: React.FC<CardEditModalProps> = ({ card, onSave, onCancel }) => {
  const [programQuery, setProgramQuery] = useState('');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [nickname, setNickname] = useState(card?.card_name || '');
  const [lastFour, setLastFour] = useState(card?.last_four || '');
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low'>('medium');

  // earn overrides for manual entry per slug
  interface EarnEntry { multiplier: string; cap_amount: string; cap_period: string; fallback: string; }
  const [earnOverrides, setEarnOverrides] = useState<Record<string, EarnEntry>>({});
  const updateEarn = (slug: string, field: keyof EarnEntry, value: string) =>
    setEarnOverrides((prev) => ({ ...prev, [slug]: { multiplier: '', cap_amount: '', cap_period: '', fallback: '', ...prev[slug], [field]: value } }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // community PR step — shown after card is saved
  const [savedCardId, setSavedCardId] = useState<number | null>(null);
  const [submittingPr, setSubmittingPr] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load full program list on mount (shown immediately on focus)
  const loadPrograms = useCallback(async (q = '') => {
    setLoadingPrograms(true);
    try {
      const results = await pointspalService.searchPrograms(q);
      setPrograms(results);
    } catch {
      setPrograms([]);
    } finally {
      setLoadingPrograms(false);
    }
  }, []);

  useEffect(() => { loadPrograms(); }, [loadPrograms]);

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadPrograms(programQuery), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [programQuery, loadPrograms]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectProgram = (prog: Program) => {
    setSelectedProgram(prog);
    setProgramQuery(prog.program_name);
    setShowDropdown(false);
    setEarnOverrides({}); // clear manual overrides when a program is selected
    if (!nickname) setNickname(prog.program_name);
  };

  const handleClearProgram = () => {
    setSelectedProgram(null);
    setProgramQuery('');
    setPrograms([]);
    loadPrograms();
    searchRef.current?.focus();
  };

  const handleSave = async (verify: boolean) => {
    if (!nickname.trim() && !selectedProgram) {
      setError('Enter a card nickname or select a program.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Build earn_override from filled-in manual rates
      const overrideEntries = Object.entries(earnOverrides).filter(([, e]) => e.multiplier !== '' && !isNaN(parseFloat(e.multiplier)));
      const earnOverride = overrideEntries.length > 0
        ? Object.fromEntries(overrideEntries.map(([slug, e]) => {
            const m = parseFloat(e.multiplier);
            const hasCap = e.cap_amount !== '' && !isNaN(parseFloat(e.cap_amount));
            if (hasCap || e.cap_period) {
              return [slug, {
                multiplier: m,
                cap_amount: hasCap ? parseFloat(e.cap_amount) : null,
                cap_period: e.cap_period || null,
                fallback: e.fallback !== '' && !isNaN(parseFloat(e.fallback)) ? parseFloat(e.fallback) : 1.0,
              }];
            }
            return [slug, m];
          }))
        : undefined;

      const payload: Record<string, unknown> = {
        card_nickname: nickname.trim() || selectedProgram?.program_name || 'My Card',
        last_four:     lastFour || undefined,
        confidence_level: verify ? 'high' : confidence,
        program_id:    selectedProgram?.program_id || undefined,
        earn_override: earnOverride,
      };

      if (card) {
        await pointspalService.updateCard(card.id, payload);
        if (verify) await pointspalService.verifyCard(card.id);
        setSavedCardId(card.id);
      } else {
        const newCard = await pointspalService.addCard(payload);
        setSavedCardId(newCard.id);
      }
      // Don't call onSave() yet — show community PR step first
    } catch {
      setError('Failed to save card. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitCommunityPr = async () => {
    if (!savedCardId) return;
    setSubmittingPr(true);
    try {
      const url = await pointspalService.generatePrUrl(savedCardId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // silently fail — don't block user from closing
    } finally {
      setSubmittingPr(false);
      onSave();
    }
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    background: 'var(--input-bg)', border: '1px solid var(--border)',
    color: 'var(--ink)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontFamily: "'Bricolage Grotesque', sans-serif",
    fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: 6, display: 'block',
  };

  const noProgram = !selectedProgram;

  // ── Community PR step (shown after card is saved) ───────────────────────────
  if (savedCardId !== null) {
    return (
      <div style={overlayStyle}>
        <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', width: '100%', maxWidth: 460, boxShadow: 'var(--sh-md)', display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={modalHeaderStyle}>
            <h2 style={modalTitleStyle}>
              Card saved ✓
            </h2>
            <button onClick={onSave} style={iconBtnStyle}>
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
            <div style={{ fontSize: 40 }}>🌐</div>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>
              Help the finPal community
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 360, margin: 0 }}>
              Your earn rates and caps are valuable to other finPal users. Submit a PR to the communal points database so everyone benefits — it takes less than a minute on GitHub.
            </p>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
              Opens a pre-filled GitHub issue. No personal data is shared.
            </p>
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <button
              onClick={onSave}
              style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink3)', fontSize: 13, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, cursor: 'pointer' }}
            >
              Maybe later
            </button>
            <button
              onClick={handleSubmitCommunityPr}
              disabled={submittingPr}
              style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: 'var(--g700)', color: '#fff', fontSize: 13, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <ExternalLink size={14} />
              {submittingPr ? 'Opening…' : 'Submit PR for communal points'}
            </button>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', width: '100%', maxWidth: 500, boxShadow: 'var(--sh-md)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>

        {/* Header */}
        <div style={modalHeaderStyle}>
          <h2 style={modalTitleStyle}>
            {card ? 'Edit Card' : 'Add Card to Wallet'}
          </h2>
          <button onClick={onCancel} style={iconBtnStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {error && (
            <div style={{ background: 'var(--re50)', border: '1px solid var(--re100)', color: 'var(--re600)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* ── Program search dropdown ── */}
          <div>
            <label style={lbl}>Rewards Program</label>
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                <input
                  ref={searchRef}
                  style={{ ...inp, paddingLeft: 32, paddingRight: 32 }}
                  placeholder="Search Chase, Amex, Citi… or type to filter"
                  value={programQuery}
                  onChange={(e) => { setProgramQuery(e.target.value); setSelectedProgram(null); }}
                  onFocus={() => setShowDropdown(true)}
                  disabled={!!selectedProgram}
                />
                <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
              </div>

              {showDropdown && !selectedProgram && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                  background: 'var(--white)', border: '1px solid var(--border)',
                  borderRadius: 8, boxShadow: 'var(--sh-md)', maxHeight: 240, overflowY: 'auto', marginTop: 4,
                }}>
                  {loadingPrograms && (
                    <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>Loading…</div>
                  )}
                  {!loadingPrograms && programs.length === 0 && (
                    <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)' }}>
                      No programs found. Fill in a nickname below to add manually.
                    </div>
                  )}
                  {!loadingPrograms && programs.map((p) => (
                    <button
                      key={p.program_id}
                      onMouseDown={(e) => { e.preventDefault(); handleSelectProgram(p); }}
                      style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--g50)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <div>
                        <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{p.program_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{p.issuer}{p.network ? ` · ${p.network}` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {p.tpg_cpp != null && <div style={{ fontSize: 11, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, color: 'var(--g700)' }}>{p.tpg_cpp}¢/pt</div>}
                        {p.annual_fee != null && <div style={microTextStyle}>${p.annual_fee}/yr</div>}
                      </div>
                    </button>
                  ))}
                  {/* Manual entry option always at bottom */}
                  <button
                    onMouseDown={(e) => { e.preventDefault(); setShowDropdown(false); setSelectedProgram(null); setProgramQuery(''); }}
                    style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 12 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--g50)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <Plus size={13} /> Enter card details manually (not in database)
                  </button>
                </div>
              )}
            </div>

            {/* Selected program pill */}
            {selectedProgram && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--g50)', border: '1px solid var(--g200)', borderRadius: 8, fontSize: 12, color: 'var(--g700)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <strong>{selectedProgram.program_name}</strong>
                  {selectedProgram.tpg_cpp != null ? ` · ${selectedProgram.tpg_cpp}¢/pt` : ''}
                  {selectedProgram.annual_fee != null ? ` · $${selectedProgram.annual_fee}/yr` : ''}
                </span>
                <button onClick={handleClearProgram} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--g700)', padding: 2, display: 'flex', alignItems: 'center' }}>
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Not in DB hint */}
            {!selectedProgram && (
              <p style={captionStyle}>
                Can't find your card? Enter it manually below and optionally submit it to the community database.
              </p>
            )}
          </div>

          {/* ── Nickname ── */}
          <div>
            <label style={lbl}>Card Nickname</label>
            <input
              style={inp}
              placeholder={selectedProgram ? selectedProgram.program_name : 'e.g. Sapphire Reserve, Freedom Unlimited…'}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>

          {/* ── Last four ── */}
          <div>
            <label style={lbl}>
              Last 4 Digits&nbsp;
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — helps auto-match transactions)</span>
            </label>
            <input
              style={{ ...inp, maxWidth: 110 }}
              placeholder="1234"
              maxLength={4}
              value={lastFour}
              onChange={(e) => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>

          {/* ── Manual earn rates + caps (only when no program selected) ── */}
          {noProgram && (
            <div>
              <label style={lbl}>
                Earn Rates &amp; Caps&nbsp;
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(leave blank to skip)</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '130px 52px 90px 90px 52px', gap: 6, alignItems: 'center', padding: '0 2px' }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Category</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Rate</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Cap $</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Period</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right' }}>Fallbk</span>
                </div>

                {COMMON_CATEGORIES.map(({ slug, label }) => {
                  const e = earnOverrides[slug] ?? { multiplier: '', cap_amount: '', cap_period: '', fallback: '' };
                  const active = e.multiplier !== '';
                  return (
                    <div
                      key={slug}
                      style={{ display: 'grid', gridTemplateColumns: '130px 52px 90px 90px 52px', gap: 6, alignItems: 'center', padding: '6px 8px', borderRadius: 8, background: active ? 'var(--g50)' : 'var(--input-bg)', border: `1px solid ${active ? 'var(--g200)' : 'var(--border)'}`, transition: 'all 0.15s' }}
                    >
                      <span style={{ fontSize: 12, color: active ? 'var(--g700)' : 'var(--ink3)', fontWeight: active ? 700 : 400, fontFamily: "'Bricolage Grotesque', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>

                      {/* Multiplier */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <input
                          type="number" min="1" max="20" step="0.5" placeholder="—"
                          value={e.multiplier}
                          onChange={(ev) => updateEarn(slug, 'multiplier', ev.target.value)}
                          style={{ width: 40, padding: '4px 5px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--white)', color: 'var(--ink)', fontSize: 12, textAlign: 'right', outline: 'none' }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>×</span>
                      </div>

                      {/* Cap amount */}
                      <input
                        type="number" min="0" step="500" placeholder="no cap"
                        value={e.cap_amount}
                        onChange={(ev) => updateEarn(slug, 'cap_amount', ev.target.value)}
                        disabled={!active}
                        style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, background: active ? 'var(--white)' : 'var(--input-bg)', color: 'var(--ink)', fontSize: 12, textAlign: 'right', outline: 'none', opacity: active ? 1 : 0.4 }}
                      />

                      {/* Cap period */}
                      <select
                        value={e.cap_period}
                        onChange={(ev) => updateEarn(slug, 'cap_period', ev.target.value)}
                        disabled={!active || e.cap_amount === ''}
                        style={{ width: '100%', padding: '4px 4px', border: '1px solid var(--border)', borderRadius: 6, background: active && e.cap_amount !== '' ? 'var(--white)' : 'var(--input-bg)', color: 'var(--ink)', fontSize: 11, outline: 'none', opacity: active && e.cap_amount !== '' ? 1 : 0.4 }}
                      >
                        <option value="">—</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annual">Annual</option>
                      </select>

                      {/* Fallback rate */}
                      <input
                        type="number" min="1" max="20" step="0.5" placeholder="1×"
                        value={e.fallback}
                        onChange={(ev) => updateEarn(slug, 'fallback', ev.target.value)}
                        disabled={!active || e.cap_amount === ''}
                        style={{ width: '100%', padding: '4px 5px', border: '1px solid var(--border)', borderRadius: 6, background: active && e.cap_amount !== '' ? 'var(--white)' : 'var(--input-bg)', color: 'var(--ink)', fontSize: 12, textAlign: 'right', outline: 'none', opacity: active && e.cap_amount !== '' ? 1 : 0.4 }}
                      />
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, margin: '8px 0 0', padding: '6px 10px', background: 'var(--au50)', border: '1px solid var(--au100)', borderRadius: 6, color: 'var(--au600)' }}>
                Cap $ is the spend limit before the rate drops to the fallback. Period sets whether it resets monthly, quarterly, or annually.
                Data you enter can be submitted to the community database so others benefit too.
              </p>
            </div>
          )}

          {/* ── Confidence (new cards only) ── */}
          {!card && (
            <div>
              <label style={lbl}>Confidence Level</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['high', 'medium', 'low'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setConfidence(lvl)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                      fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700,
                      border: confidence === lvl ? '2px solid var(--g700)' : '1px solid var(--border)',
                      background: confidence === lvl ? 'var(--g50)' : 'var(--white)',
                      color: confidence === lvl ? 'var(--g700)' : 'var(--muted)',
                    }}
                  >
                    {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                  </button>
                ))}
              </div>
              <p style={captionStyle}>Low confidence cards are excluded from optimizer recommendations.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink3)', fontSize: 13, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 13, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, cursor: 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none', background: 'var(--g700)', color: '#fff', fontSize: 13, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <CheckCircle size={14} />
            {saving ? 'Saving…' : card ? 'Save & Verify Rates' : 'Add to Wallet'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── MyCards page ──────────────────────────────────────────────────────────────

const MyCards: React.FC = () => {
  const [cards, setCards] = useState<WalletCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<WalletCard | null | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [submittingPrId, setSubmittingPrId] = useState<number | null>(null);
  const [expandedTxCard, setExpandedTxCard] = useState<number | null>(null);
  const [txnCache, setTxnCache] = useState<Record<number, CardTransaction[]>>({});
  const [txnLoading, setTxnLoading] = useState<number | null>(null);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await pointspalService.getCards();
      setCards(data);
    } catch {
      setError('Failed to load cards. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Remove this card from your wallet?')) return;
    setDeletingId(id);
    try {
      await pointspalService.deleteCard(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmitPr = async (card: WalletCard) => {
    setSubmittingPrId(card.id);
    try {
      const url = await pointspalService.generatePrUrl(card.id);
      window.open(url, '_blank', 'noopener,noreferrer');
      // Refresh so submitted_to_community flag updates
      fetchCards();
    } catch {
      // silently fail
    } finally {
      setSubmittingPrId(null);
    }
  };

  const toggleTxPanel = async (cardId: number) => {
    if (expandedTxCard === cardId) { setExpandedTxCard(null); return; }
    setExpandedTxCard(cardId);
    if (!txnCache[cardId]) {
      setTxnLoading(cardId);
      try {
        const data = await pointspalService.getCardTransactions(cardId);
        setTxnCache((prev) => ({ ...prev, [cardId]: data }));
      } catch {
        setTxnCache((prev) => ({ ...prev, [cardId]: [] }));
      } finally {
        setTxnLoading(null);
      }
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Loading size="md" text="Loading cards…" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ color: 'var(--re600)', marginBottom: 12, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700 }}>{error}</div>
        <button onClick={fetchCards} style={btnStyle}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', background: 'var(--bg)', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--ink)', margin: 0 }}>My Cards</h1>
          <div style={{ marginTop: 6 }}><ScopeTag scope="yours" /></div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Balances, earn rates, cap rules, and verification status.</p>
        </div>
        <button onClick={() => setEditingCard(null)} style={{ ...btnStyle, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Plus size={15} /> Add Card
        </button>
      </div>

      {cards.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>💳</div>
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--ink)', marginBottom: 8 }}>No cards added yet</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Add your rewards cards to start tracking caps and earning optimization.</div>
          <button onClick={() => setEditingCard(null)} style={{ ...btnStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Add your first card
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {cards.map((card) => {
            const isStale = card.stale_status !== 'ok';

            return (
              <div
                key={card.id}
                style={{ background: 'var(--white)', border: `1px solid ${isStale ? 'var(--au300)' : 'var(--border)'}`, borderRadius: 'var(--r)', overflow: 'hidden', boxShadow: 'var(--sh-sm)' }}
              >
                <CardFace
                  issuerColor={card.issuer_color}
                  cardName={card.card_name}
                  issuer={`${card.issuer} · ${card.program}`}
                  points={card.points}
                  ptsLabel="pts"
                  style={{ borderRadius: '12px 12px 0 0', minHeight: 90 }}
                />

                {card.expiry_alert && (
                  <div style={{ background: 'var(--au50)', color: 'var(--au600)', fontSize: 11, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, padding: '6px 14px' }}>
                    ⚠️ {card.expiry_alert}
                  </div>
                )}

                {isStale ? (
                  <div style={{ background: 'var(--au50)', color: 'var(--au600)', fontSize: 11, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, padding: '6px 14px' }}>
                    🔍 Issuer updated program — verify rates
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--g700)', padding: '6px 14px', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600 }}>
                    ✅ Rates verified {card.verified_at ? new Date(card.verified_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'never'}
                  </div>
                )}

                {/* Meta grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                  {[
                    { label: 'Est. Value',   value: `$${card.est_value_usd.toLocaleString()}`,                       color: 'var(--g700)' },
                    { label: 'Annual Fee',   value: card.annual_fee === 0 ? '$0' : `$${card.annual_fee}/yr`,         color: card.annual_fee > 0 ? 'var(--au600)' : 'var(--g700)' },
                    { label: 'Avg Rate YTD', value: `${card.avg_rate_ytd}×`,                                          color: 'var(--g700)' },
                    { label: 'Program',      value: card.program || '—',                                               color: 'var(--ink3)' },
                  ].map(({ label, value, color }, i) => (
                    <div key={label} style={{ padding: '8px 14px', borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                      <div style={{ fontSize: 13, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, color, marginTop: 2 }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Earn rates */}
                <div style={{ padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Earn Rates & Caps{isStale ? ' (unverified)' : ''}
                    {isStale && <span style={{ color: 'var(--au600)', marginLeft: 4 }}>⚠</span>}
                  </div>
                  {card.earn_caps.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No earn rate data — edit card to link a program or enter manually.</div>
                  ) : (
                    card.earn_caps.map((cap, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: i < card.earn_caps.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{cap.category}</span>
                        <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 11, color: 'var(--ink)' }}>
                          {cap.rate}×{' '}
                          {cap.cap_amount
                            ? <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>to ${cap.cap_amount.toLocaleString()}/{cap.cap_period}</span>
                            : <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>no cap</span>
                          }
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Card actions */}
                <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8 }}>
                  {isStale ? (
                    <button
                      onClick={() => setEditingCard(card)}
                      style={{ flex: 1, padding: '8px', borderRadius: 'var(--rs)', background: 'var(--au500)', color: '#fff', border: 'none', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
                    >
                      Review & Verify Rates →
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditingCard(card)}
                      style={{ flex: 1, padding: '8px', borderRadius: 'var(--rs)', background: 'var(--g50)', color: 'var(--g700)', border: '1px solid var(--g200)', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(card.id)}
                    disabled={deletingId === card.id}
                    style={{ padding: '8px 10px', borderRadius: 'var(--rs)', background: 'var(--re50)', color: 'var(--re600)', border: '1px solid var(--re100)', cursor: 'pointer' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Community contribution */}
                <div style={{ padding: '0 14px 14px' }}>
                  <button
                    onClick={() => handleSubmitPr(card)}
                    disabled={submittingPrId === card.id}
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 'var(--rs)',
                      background: 'transparent',
                      border: '1px dashed var(--border)',
                      color: 'var(--muted)', fontSize: 11,
                      fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--g400)'; e.currentTarget.style.color = 'var(--g700)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
                  >
                    <ExternalLink size={11} />
                    {submittingPrId === card.id ? 'Opening…' : 'Submit earn rates to community database'}
                  </button>
                </div>

                {/* Transactions toggle */}
                <div style={{ borderTop: '1px solid var(--border)', padding: '0 14px' }}>
                  <button
                    onClick={() => toggleTxPanel(card.id)}
                    style={{ width: '100%', padding: '10px 0', background: 'none', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 11, color: 'var(--g700)' }}
                  >
                    <span>Recent Transactions</span>
                    <span style={{ fontSize: 14 }}>{expandedTxCard === card.id ? '▲' : '▼'}</span>
                  </button>

                  {expandedTxCard === card.id && (
                    <div style={{ paddingBottom: 12 }}>
                      {txnLoading === card.id ? (
                        <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: 12 }}>Loading…</div>
                      ) : !txnCache[card.id] || txnCache[card.id].length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: 12, fontStyle: 'italic' }}>No transactions in the last 60 days</div>
                      ) : (
                        txnCache[card.id].map((txn, i) => (
                          <div key={txn.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < txnCache[card.id].length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, fontSize: 11, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {txn.description || txn.category}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{txn.category || 'Uncategorized'} · {txn.date} · {txn.rate}×</div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 11, color: 'var(--g700)' }}>+{txn.pts_earned.toLocaleString()} pts</div>
                              <div style={microTextStyle}>${txn.amount.toFixed(2)}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Add modal */}
      {editingCard !== undefined && (
        <CardEditModal
          card={editingCard}
          onSave={() => { setEditingCard(undefined); fetchCards(); }}
          onCancel={() => setEditingCard(undefined)}
        />
      )}
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--g700)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--rs)',
  fontFamily: "'Bricolage Grotesque', sans-serif",
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
};

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modalHeaderStyle: React.CSSProperties = { padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 };
const modalTitleStyle: React.CSSProperties = { fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 17, color: 'var(--ink)', margin: 0 };
const iconBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 };
const microTextStyle: React.CSSProperties = { fontSize: 10, color: 'var(--muted)' };
const captionStyle: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', margin: '6px 0 0' };

export default MyCards;
