import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Flower2, ShieldCheck, Sparkles } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { createPortal } from "react-dom";
import Seo from "../../components/Seo";
import { useAuth } from "../auth/AuthContext";
import { api } from "../../services/api";

const MINIMUM_DEITIES = 2;

const DEITIES = [
  { id: "ganesha", name: "Lord Ganesha", skin: "#C98D6A", robe: "#C2461C" },
  { id: "hanuman", name: "Lord Hanuman", skin: "#E08A3A", robe: "#B8321C" },
  { id: "shiva", name: "Lord Shiva", skin: "#9DB4D6", robe: "#7A5A3A" },
  { id: "vishnu", name: "Lord Vishnu", skin: "#5F87C9", robe: "#E4B52E" },
  { id: "lakshmi", name: "Goddess Lakshmi", skin: "#E9B98C", robe: "#C8283A" },
  { id: "durga", name: "Goddess Durga", skin: "#E3A878", robe: "#B31E2E" },
  {
    id: "saraswati",
    name: "Goddess Saraswati",
    skin: "#EBC39B",
    robe: "#F4F1E8",
  },
  { id: "krishna", name: "Lord Krishna", skin: "#4F78B8", robe: "#F0C22E" },
];

function DeityArtwork({ deity, className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 260"
      role="img"
      aria-label={deity.name}
    >
      <circle cx="100" cy="94" r="77" fill="#D7BE81" opacity=".3" />
      <circle
        cx="100"
        cy="92"
        r="62"
        fill="none"
        stroke="#B9852D"
        strokeWidth="2"
      />
      <path
        d="M43 248c2-78 24-116 57-116s55 38 57 116z"
        fill={deity.robe}
        stroke="#755B32"
        strokeWidth="2"
      />
      <path
        d="M73 135c18 20 36 20 54 0"
        fill="none"
        stroke="#D7BE81"
        strokeWidth="6"
      />
      <ellipse
        cx="100"
        cy="87"
        rx="29"
        ry="34"
        fill={deity.skin}
        stroke="#755B32"
        strokeWidth="2"
      />
      <path
        d="M70 69c7-23 53-23 60 0l-30-10z"
        fill="#E1C47B"
        stroke="#B9852D"
        strokeWidth="2"
      />
      <circle cx="100" cy="47" r="5" fill="#B9852D" />
      <path d="M88 89h4m16 0h4" stroke="#1C2C25" strokeWidth="4" />
      <path d="M94 105q6 5 12 0" fill="none" stroke="#7A2A12" strokeWidth="2" />
      <path
        d="M64 248q12-19 24 0m24 0q12-19 24 0"
        fill="none"
        stroke="#B9852D"
        strokeWidth="4"
      />
    </svg>
  );
}

function DevoteeArtwork({ gender, className = "" }) {
  const female = gender === "female";
  const clothes = female ? "#9C1C34" : "#F1E6C8";
  const skin = female ? "#E3AE88" : "#D9A07A";

  return (
    <svg
      className={className}
      viewBox="0 0 120 220"
      role="img"
      aria-label={`${female ? "Female" : "Male"} devotee`}
    >
      <path
        d={female ? "M30 112h60l12 108H18z" : "M34 128h52l8 92H26z"}
        fill={clothes}
        stroke="#755B32"
        strokeWidth="2"
      />
      <path
        d="M30 86q30-14 60 0l4 55H26z"
        fill={female ? "#D7BE81" : clothes}
        stroke="#755B32"
        strokeWidth="2"
      />
      <rect x="54" y="67" width="12" height="22" fill={skin} />
      <circle cx="60" cy="53" r="23" fill="#2A1408" />
      <ellipse cx="60" cy="57" rx="17" ry="19" fill={skin} />
      {female && <path d="M40 43q2-31 20-31t20 31" fill="#2A1408" />}
      <path
        d="M38 94q-15 24 12 40m32-40q15 24-12 40"
        fill="none"
        stroke={skin}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M54 57h2m12 0h2"
        stroke="#2A1408"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M56 67q4 3 8 0" fill="none" stroke="#7A2A12" strokeWidth="2" />
    </svg>
  );
}

export default function OfferingGame() {
  const { user, ready } = useAuth();
  const [gameClaimId, setGameClaimId] = useState(() =>
    globalThis.crypto.randomUUID(),
  );
  const [screen, setScreen] = useState("welcome");
  const [devotee, setDevotee] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [currentId, setCurrentId] = useState(null);
  const [offerings, setOfferings] = useState({});
  const [busy, setBusy] = useState(false);
  const [animation, setAnimation] = useState(null);
  const [message, setMessage] = useState("Choose how to make your offering.");
  const [reward, setReward] = useState(null);
  const [rewardLoading, setRewardLoading] = useState(false);
  const [rewardError, setRewardError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const timer = useRef(null);
  const gallerySelectionOrigin = useRef(null);
  const offeringOrder = useRef([]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (
      user?.role !== "customer" ||
      sessionStorage.getItem("offeringGameRewardPending") !== "true"
    )
      return;
    sessionStorage.removeItem("offeringGameRewardPending");
    setScreen("reward");
    setRewardLoading(true);
    api
      .post("/orders/coupons/game-reward", { claimId: gameClaimId })
      .then(({ data }) => setReward(data.coupon))
      .catch((error) =>
        setRewardError(
          error.response?.data?.message ||
            "Could not issue your coupon. Please try again.",
        ),
      )
      .finally(() => setRewardLoading(false));
  }, [gameClaimId, user]);

  useEffect(() => {
    if (!showExitConfirm) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setShowExitConfirm(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showExitConfirm]);

  const honoured = [...selected].filter((id) => {
    const types = offerings[id] || {};
    return types.flowers && types.perfume;
  });
  const currentDeity = DEITIES.find((deity) => deity.id === currentId);
  const currentOfferings = offerings[currentId] || {};
  const progress = selected.size
    ? Math.min((honoured.length / selected.size) * 100, 100)
    : 0;

  function getOfferingPrompt(deity, types = {}) {
    const remaining = ["flowers", "perfume"].filter((type) => !types[type]);
    if (remaining.length === 0) {
      return `${deity.name} has received both offerings. Choose another deity to continue.`;
    }
    return `Offer ${remaining.join(" and ")} to ${deity.name}.`;
  }

  function chooseDeity(deityId) {
    const alreadyStarted = Boolean(
      offerings[deityId]?.flowers || offerings[deityId]?.perfume,
    );
    if (busy || (selected.has(deityId) && alreadyStarted)) return;

    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(deityId)) next.delete(deityId);
      else next.add(deityId);
      return next;
    });
  }

  function beginOffering() {
    if (selected.size < MINIMUM_DEITIES) return;
    const selectedIds = [...selected];
    const previousSelection = gallerySelectionOrigin.current;
    const newlySelected = previousSelection
      ? selectedIds.filter((id) => !previousSelection.has(id))
      : [];
    const remaining = selectedIds.filter((id) => !newlySelected.includes(id));
    const orderedIds = newlySelected.length
      ? [...newlySelected, ...remaining]
      : selected.has(currentId)
        ? [currentId, ...selectedIds.filter((id) => id !== currentId)]
        : selectedIds;
    const isIncomplete = (id) => {
      const types = offerings[id] || {};
      return !(types.flowers && types.perfume);
    };
    const nextId = orderedIds.find(isIncomplete) || orderedIds[0];
    if (!nextId) return;
    offeringOrder.current = orderedIds;
    gallerySelectionOrigin.current = null;
    setCurrentId(nextId);
    setMessage(
      getOfferingPrompt(
        DEITIES.find((deity) => deity.id === nextId),
        offerings[nextId],
      ),
    );
    setScreen("offer");
  }

  function makeOffering(type) {
    if (busy || !currentDeity || currentOfferings[type]) return;
    const deityId = currentDeity.id;
    setBusy(true);
    setAnimation(type);
    setMessage(
      type === "flowers"
        ? `Offering flowers to ${currentDeity.name}...`
        : `Offering perfume to ${currentDeity.name}...`,
    );

    timer.current = window.setTimeout(() => {
      const nextOfferings = {
        ...offerings,
        [deityId]: { ...offerings[deityId], [type]: true },
      };
      const nextHonouredCount = [...selected].filter((id) => {
        const types = nextOfferings[id] || {};
        return types.flowers && types.perfume;
      }).length;
      const deityComplete =
        nextOfferings[deityId].flowers && nextOfferings[deityId].perfume;
      const selectedOrder = offeringOrder.current.length
        ? offeringOrder.current
        : [...selected];
      const nextId = deityComplete
        ? selectedOrder.find((id) => {
            const types = nextOfferings[id] || {};
            return (
              selected.has(id) &&
              id !== deityId &&
              !(types.flowers && types.perfume)
            );
          })
        : null;
      const nextDeity = DEITIES.find((deity) => deity.id === nextId);

      setOfferings(nextOfferings);
      setBusy(false);
      setAnimation(null);
      if (nextHonouredCount >= selected.size) {
        setMessage(
          `All ${selected.size} selected deities honoured. Your blessing awaits.`,
        );
      } else if (nextDeity) {
        setCurrentId(nextDeity.id);
        setMessage(getOfferingPrompt(nextDeity, nextOfferings[nextDeity.id]));
      } else if (deityComplete) {
        setMessage(
          `${currentDeity.name} has received both offerings. Choose another deity to continue.`,
        );
      } else {
        setMessage(
          `${type === "flowers" ? "Flowers have been" : "Perfume has been"} offered to ${currentDeity.name}. Offer ${type === "flowers" ? "perfume" : "flowers"} to complete the offering.`,
        );
      }
      timer.current = null;
    }, 2000);
  }

  async function receiveBlessing() {
    if (
      selected.size < MINIMUM_DEITIES ||
      honoured.length < selected.size ||
      rewardLoading
    )
      return;
    setCopied(false);
    setCopyError("");
    setScreen("reward");
    setReward(null);
    setRewardError("");
    if (!ready) {
      setRewardError("Your account is still loading. Please try again.");
      return;
    }
    if (!user) {
      sessionStorage.setItem("offeringGameRewardPending", "true");
      setRewardError("Sign in to claim a coupon you can use at checkout.");
      return;
    }
    setRewardLoading(true);
    try {
      const { data } = await api.post("/orders/coupons/game-reward", {
        claimId: gameClaimId,
      });
      setReward(data.coupon);
    } catch (error) {
      setRewardError(
        error.response?.data?.message ||
          "Could not issue your coupon. Please try again.",
      );
    } finally {
      setRewardLoading(false);
    }
  }

  async function copyReward() {
    if (!reward) return;
    try {
      await navigator.clipboard.writeText(reward.code);
      setCopied(true);
      setCopyError("");
    } catch {
      setCopyError("Copying is not available in this browser.");
    }
  }

  function restartGame() {
    sessionStorage.removeItem("offeringGameRewardPending");
    setDevotee(null);
    setSelected(new Set());
    setCurrentId(null);
    gallerySelectionOrigin.current = null;
    offeringOrder.current = [];
    setOfferings({});
    setBusy(false);
    setAnimation(null);
    setReward(null);
    setRewardLoading(false);
    setRewardError("");
    setCopied(false);
    setCopyError("");
    setMessage("Choose how to make your offering.");
    setGameClaimId(globalThis.crypto.randomUUID());
    setScreen("devotee");
  }

  if (!ready) return <div className="loading-state">Loading…</div>;
  if (!user)
    return <Navigate to="/login" replace state={{ from: "/play" }} />;
  if (user.role !== "customer")
    return (
      <Navigate
        to={user.role === "admin" ? "/admin" : "/admin/services"}
        replace
      />
    );

  return (
    <section className="offering-game" aria-label="A Moment of Devotion">
      <Seo
        title="A Moment of Devotion"
        description="Offer flowers or perfume to the deities in the Divine Vikas offering game."
      />
      <button
        type="button"
        className="offering-game__back"
        aria-label="Back to Divine Vikas home"
        onClick={() => setShowExitConfirm(true)}
      >
        <ArrowLeft size={20} strokeWidth={3.5} aria-hidden="true" />
        <span>Home</span>
      </button>

      {showExitConfirm &&
        createPortal(
          <div
            className="confirm-overlay class-exit-overlay offering-game__exit-overlay"
            onClick={() => setShowExitConfirm(false)}
          >
            <section
              className="confirm-dialog class-exit-dialog offering-game__exit-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="offering-game-exit-title"
              aria-describedby="offering-game-exit-description"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="class-exit-icon" aria-hidden="true">
                <ShieldCheck size={23} />
              </div>
              <span className="eyebrow">A MOMENT OF DEVOTION</span>
              <h2 id="offering-game-exit-title">
                Are you sure you want to exit?
              </h2>
              <p id="offering-game-exit-description">
                Leaving now will end this game session. Your current offering
                progress is not saved.
              </p>
              <div className="class-exit-actions">
                <button
                  type="button"
                  className="btn class-flow-button class-flow-button--green"
                  autoFocus
                  onClick={() => setShowExitConfirm(false)}
                >
                  Stay and play
                </button>
                <Link
                  className="btn class-flow-button class-flow-button--danger"
                  to="/"
                  onClick={() => setShowExitConfirm(false)}
                >
                  Exit to home
                </Link>
              </div>
            </section>
          </div>,
          document.body,
        )}

      {screen === "welcome" && (
        <div className="offering-game__screen offering-game__welcome">
          <div className="offering-game__emblem" aria-hidden="true">
            <Flower2 size={54} strokeWidth={1.3} />
          </div>
          <p className="offering-game__brand">DIVINE VIKAS</p>
          <h1>A Moment of Devotion</h1>
          <p className="offering-game__description">
            Offer your prayers to the divine and receive a special blessing.
          </p>
          <div className="offering-game__diyas" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <button
            className="offering-game__button"
            onClick={() => setScreen("devotee")}
          >
            Begin Your Offering
          </button>
        </div>
      )}

      {screen === "devotee" && (
        <div className="offering-game__screen offering-game__devotee-screen">
          <p className="offering-game__brand">DIVINE VIKAS</p>
          <h1>Choose your devotee</h1>
          <p className="offering-game__description">
            Who will make the offering?
          </p>
          <div className="offering-game__devotees">
            {["male", "female"].map((gender) => (
              <button
                className={`offering-game__card${devotee === gender ? " is-selected" : ""}`}
                key={gender}
                onClick={() => {
                  setDevotee(gender);
                  setScreen("gallery");
                }}
              >
                <DevoteeArtwork
                  gender={gender}
                  className="offering-game__devotee-art"
                />
                <span>
                  {gender === "male" ? "Male devotee" : "Female devotee"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === "gallery" && (
        <div className="offering-game__screen offering-game__gallery">
          <p className="offering-game__brand">DIVINE VIKAS</p>
          <h1>Select your deities</h1>
          <p className="offering-game__description">
            Choose at least two deities to honour.
          </p>
          <div className="offering-game__deities">
            {DEITIES.map((deity) => {
              const isSelected = selected.has(deity.id);
              const isStarted = Boolean(
                offerings[deity.id]?.flowers || offerings[deity.id]?.perfume,
              );
              return (
                <button
                  className={`offering-game__card${isSelected ? " is-selected" : ""}`}
                  key={deity.id}
                  aria-pressed={isSelected}
                  disabled={isSelected && isStarted}
                  onClick={() => chooseDeity(deity.id)}
                >
                  {isSelected && (
                    <span className="offering-game__check" aria-hidden="true">
                      <Check size={16} />
                    </span>
                  )}
                  <DeityArtwork
                    deity={deity}
                    className="offering-game__deity-art"
                  />
                  <span>{deity.name}</span>
                </button>
              );
            })}
          </div>
          <p className="offering-game__selection-count" aria-live="polite">
            Selected: {selected.size}
            {selected.size < MINIMUM_DEITIES &&
              ` (choose at least ${MINIMUM_DEITIES})`}
          </p>
          <div className="offering-game__actions">
            <button
              className="offering-game__button offering-game__button--secondary"
              onClick={() => setScreen("devotee")}
            >
              Back
            </button>
            <button
              className="offering-game__button"
              disabled={selected.size < MINIMUM_DEITIES}
              onClick={beginOffering}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {screen === "offer" && currentDeity && (
        <div className="offering-game__screen offering-game__offer">
          <div className="offering-game__progress">
            <span>
              Deities honoured: {honoured.length}/{selected.size}
            </span>
            <div className="offering-game__progress-track">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="offering-game__tabs" aria-label="Selected deities">
            {DEITIES.filter((deity) => selected.has(deity.id)).map((deity) => (
              <button
                className={`offering-game__tab${deity.id === currentId ? " is-current" : ""}${offerings[deity.id]?.flowers && offerings[deity.id]?.perfume ? " is-honoured" : ""}`}
                key={deity.id}
                disabled={busy}
                onClick={() => {
                  setCurrentId(deity.id);
                  setMessage(getOfferingPrompt(deity, offerings[deity.id]));
                }}
              >
                {deity.name}
              </button>
            ))}
          </div>
          <div
            className={`offering-game__stage${animation ? ` is-${animation}` : ""}`}
            aria-label={`Temple scene with ${currentDeity.name}`}
          >
            <div className="offering-game__temple-arch" />
            <div className="offering-game__temple-columns" />
            <div className="offering-game__altar">
              <span />
              <span />
              <span />
            </div>
            <DeityArtwork
              deity={currentDeity}
              className="offering-game__stage-deity"
            />
            {devotee && (
              <div
                className={`offering-game__stage-devotee${animation ? ` is-${animation}` : ""}`}
              >
                <DevoteeArtwork
                  gender={devotee}
                  className="offering-game__stage-devotee-art"
                />
              </div>
            )}
            {animation && (
              <div className="offering-game__particles" aria-hidden="true">
                {Array.from({ length: 14 }, (_, index) => (
                  <span
                    className="offering-game__particle"
                    key={index}
                    style={{ "--particle-index": index }}
                  />
                ))}
              </div>
            )}
          </div>
          <p className="offering-game__message" aria-live="polite">
            {message}
          </p>
          <div className="offering-game__actions">
            <button
              className="offering-game__button"
              disabled={busy || currentOfferings.flowers}
              onClick={() => makeOffering("flowers")}
            >
              <Flower2 size={18} />
              Offer Flowers
            </button>
            <button
              className="offering-game__button"
              disabled={busy || currentOfferings.perfume}
              onClick={() => makeOffering("perfume")}
            >
              <Sparkles size={18} />
              Offer Perfume
            </button>
          </div>
          <div className="offering-game__actions offering-game__actions--secondary">
            <button
              className="offering-game__button offering-game__button--secondary"
              disabled={busy}
              onClick={() => {
                gallerySelectionOrigin.current = new Set(selected);
                setScreen("gallery");
              }}
            >
              Choose more deities
            </button>
            <button
              className="offering-game__button"
              disabled={
                busy ||
                !ready ||
                selected.size < MINIMUM_DEITIES ||
                honoured.length < selected.size
              }
              onClick={receiveBlessing}
            >
              Receive your blessing
            </button>
          </div>
        </div>
      )}

      {screen === "reward" && (
        <div className="offering-game__screen offering-game__reward">
          <Sparkles className="offering-game__reward-sparkle" size={48} />
          <p className="offering-game__brand">DIVINE VIKAS</p>
          <h1>Your devotion has been received.</h1>
          <div className="offering-game__reward-card">
            <p className="offering-game__brand">YOUR BLESSING</p>
            {rewardLoading ? (
              <p role="status">Preparing your coupon…</p>
            ) : reward ? (
              <>
                <h2>{reward.title}</h2>
                <code>{reward.code}</code>
                <button className="offering-game__button" onClick={copyReward}>
                  {copied ? "Copied" : "Copy coupon"}
                </button>
                <p className="offering-game__reward-note">
                  Apply this code in your cart within 30 days. It can be used
                  once by your account.
                </p>
              </>
            ) : (
              <p role="alert">{rewardError}</p>
            )}
            {copyError && (
              <p className="offering-game__copy-error" role="status">
                {copyError}
              </p>
            )}
          </div>
          {!user && !rewardLoading && (
            <Link
              className="offering-game__button"
              to="/login"
              state={{ from: "/play" }}
            >
              Sign in to claim your coupon
            </Link>
          )}
          {!reward && !rewardLoading && user && (
            <button
              className="offering-game__button"
              onClick={receiveBlessing}
            >
              Try again
            </button>
          )}
          {reward && (
            <Link className="offering-game__button" to="/shop">
              Shop with your coupon
            </Link>
          )}
          <button
            className="offering-game__button offering-game__button--secondary"
            onClick={restartGame}
          >
            Offer again
          </button>
        </div>
      )}
    </section>
  );
}
