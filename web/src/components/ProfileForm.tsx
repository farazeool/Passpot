"use client";

import { useState } from "react";
import { explainError, type Actor } from "@/lib/actions";
import { saveProfile, type Gender, type Profile } from "@/lib/profile";
import { Person } from "./Avatar";
import { useToast } from "./Toast";

/** Edit your profile. Saved to NEAR Social, so it follows you to other NEAR apps too. */
export function ProfileForm({
  actor,
  initial,
  onSaved,
  onCancel,
  first,
}: {
  actor: Actor;
  initial: Profile | null | undefined;
  onSaved: (p: Profile | null) => void;
  onCancel?: () => void;
  first?: boolean;
}) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [gender, setGender] = useState<Gender | undefined>(initial?.gender || undefined);
  const [location, setLocation] = useState(initial?.location ?? "");
  const [savingFor, setSavingFor] = useState(initial?.saving_for ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [image, setImage] = useState(initial?.image?.url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageOk = !image.trim() || /^https:\/\/\S+$/.test(image.trim());
  const valid = name.trim().length > 0 && name.length <= 48 && imageOk && !!gender;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = await saveProfile(actor, {
        name,
        gender,
        location,
        saving_for: savingFor,
        description,
        image: { url: image },
      });
      toast("Profile saved. Other members see it straight away.");
      onSaved(p);
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 sm:p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">{first ? "Make your profile" : "Edit profile"}</h2>
        <p className="mt-1 text-sm text-muted">
          Circles run on trust. A real name and a line about you help people say yes when you ask to join.
        </p>
      </div>
      <fieldset>
        <legend className="font-semibold text-ink text-sm mb-2">Your avatar</legend>
        <div className="flex flex-wrap items-center gap-3" role="radiogroup">
          <Person id={actor.accountId} gender={gender} size={64} className="mr-1 transition-all" />
          {(["male", "female"] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={gender === g}
              onClick={() => setGender(g)}
              className={`btn ${gender === g ? "btn-primary" : "btn-quiet"}`}
            >
              <Person id={actor.accountId} gender={g} size={24} />
              {g === "male" ? "Male" : "Female"}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="p-name" className="font-semibold text-ink text-sm block">
            Name
          </label>
          <input
            id="p-name"
            className="field"
            placeholder="Ayesha Khan"
            value={name}
            maxLength={48}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="p-city" className="font-semibold text-ink text-sm block">
            City <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="p-city"
            className="field"
            placeholder="Lahore"
            value={location}
            maxLength={48}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="p-goal" className="font-semibold text-ink text-sm block">
          Saving for <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="p-goal"
          className="field"
          placeholder="My sister's wedding, a motorbike, next term's fees"
          value={savingFor}
          maxLength={80}
          onChange={(e) => setSavingFor(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="p-about" className="font-semibold text-ink text-sm block">
          About you <span className="text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="p-about"
          className="field min-h-[88px] py-2.5"
          placeholder="Nurse at Services Hospital. Ran our family committee for six years."
          value={description}
          maxLength={280}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="p-img" className="font-semibold text-ink text-sm block">
          Photo link <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="p-img"
          className="field"
          inputMode="url"
          placeholder="https://…"
          value={image}
          onChange={(e) => setImage(e.target.value)}
          aria-invalid={!imageOk}
        />
        {!imageOk && <p className="text-sm text-missed">Use a link that starts with https://</p>}
      </div>
      {error && (
        <p role="alert" className="text-missed bg-missed-wash rounded-lg px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" type="submit" disabled={!valid || busy}>
          {busy && <span className="spinner" aria-hidden />}
          {busy ? "Saving" : "Save profile"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <p className="text-xs text-muted basis-full">
          Saved on NEAR Social, the profile store NEAR apps share. Your wallet will ask you to approve a 0.1 NEAR
          storage deposit the first time.
        </p>
      </div>
    </form>
  );
}
