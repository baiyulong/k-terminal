import { useMemo, useState } from "react";
import {
  useCreateTerminalProfileMutation,
  useDeleteTerminalProfileMutation,
  useDetectTerminalsMutation,
  useSetDefaultTerminalProfileMutation,
  useTerminalProfilesQuery,
  useUpdateTerminalProfileMutation,
} from "@/hooks/useTerminalProfiles";
import type {
  CreateTerminalProfileRequest,
  DetectedTerminal,
  TerminalProfile,
} from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

interface TerminalProfilesPageProps {
  onBack: () => void;
  onNavigateHome: () => void;
}

interface ProfileDraft {
  name: string;
  platform: string;
  command: string;
  args_template: string;
  is_default: boolean;
}

const sectionClassName =
  "rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm";
const inputClassName =
  "w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--ring))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20";
const buttonClassName =
  "inline-flex items-center justify-center rounded-xl border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--accent))]";

const emptyDraft: ProfileDraft = {
  name: "",
  platform: "linux",
  command: "",
  args_template: "",
  is_default: false,
};

export function TerminalProfilesPage({
  onBack,
  onNavigateHome,
}: TerminalProfilesPageProps) {
  const toast = useToast();
  const profilesQuery = useTerminalProfilesQuery();
  const createMutation = useCreateTerminalProfileMutation();
  const updateMutation = useUpdateTerminalProfileMutation();
  const deleteMutation = useDeleteTerminalProfileMutation();
  const defaultMutation = useSetDefaultTerminalProfileMutation();
  const detectMutation = useDetectTerminalsMutation();

  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
  const [editingProfile, setEditingProfile] = useState<TerminalProfile | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [detectedProfiles, setDetectedProfiles] = useState<DetectedTerminal[]>([]);

  const profiles = profilesQuery.data ?? [];
  const knownDetectedKeys = useMemo(
    () =>
      new Set(
        profiles.map((profile) =>
          buildTerminalKey({
            name: profile.name,
            platform: profile.platform,
            command: profile.command,
            args_template: profile.args_template,
          }),
        ),
      ),
    [profiles],
  );

  const openCreateForm = () => {
    setEditingProfile(null);
    setDraft(emptyDraft);
    setIsFormOpen(true);
  };

  const openEditForm = (profile: TerminalProfile) => {
    setEditingProfile(profile);
    setDraft({
      name: profile.name,
      platform: profile.platform,
      command: profile.command,
      args_template: profile.args_template,
      is_default: profile.is_default,
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingProfile(null);
    setDraft(emptyDraft);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload: CreateTerminalProfileRequest = {
      name: draft.name.trim(),
      platform: draft.platform,
      command: draft.command.trim(),
      args_template: draft.args_template.trim(),
      is_default: draft.is_default,
    };

    try {
      if (editingProfile) {
        await updateMutation.mutateAsync({
          id: editingProfile.id,
          changes: payload,
        });
        toast.success(`Updated ${payload.name}.`);
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(`Added ${payload.name}.`);
      }
      closeForm();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDelete = async (profile: TerminalProfile) => {
    if (!window.confirm(`Delete terminal profile “${profile.name}”?`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(profile.id);
      toast.success(`Deleted ${profile.name}.`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleSetDefault = async (profile: TerminalProfile) => {
    if (profile.is_default) {
      return;
    }

    try {
      await defaultMutation.mutateAsync(profile.id);
      toast.success(`Default terminal set to ${profile.name}.`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDetect = async () => {
    try {
      const detected = await detectMutation.mutateAsync();
      setDetectedProfiles(detected);
      if (detected.length === 0) {
        toast.error("No terminals detected on this machine.");
      } else {
        toast.success(`Detected ${detected.length} terminal profile(s).`);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleAddDetected = async (profile: DetectedTerminal) => {
    try {
      await createMutation.mutateAsync({
        ...profile,
        is_default: !profiles.some(
          (existingProfile) =>
            existingProfile.platform === profile.platform &&
            existingProfile.is_default,
        ),
      });
      toast.success(`Added ${profile.name}.`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="h-screen overflow-y-auto bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-6 py-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-5 shadow-sm">
          <div>
            <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
              Settings / Terminal Profiles
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Terminal Profiles
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onNavigateHome}
              className={buttonClassName}
            >
              Home
            </button>
            <button type="button" onClick={onBack} className={buttonClassName}>
              Back to Settings
            </button>
          </div>
        </header>

        <section className={sectionClassName}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Available Profiles</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Manage launch templates for each terminal application.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleDetect} className={buttonClassName}>
                {detectMutation.isPending ? "Detecting..." : "Detect Terminals"}
              </button>
              <button type="button" onClick={openCreateForm} className={buttonClassName}>
                Add Profile
              </button>
            </div>
          </div>

          {profilesQuery.isPending ? (
            <p className="mt-5 text-sm text-[hsl(var(--muted-foreground))]">
              Loading terminal profiles...
            </p>
          ) : profiles.length === 0 ? (
            <p className="mt-5 text-sm text-[hsl(var(--muted-foreground))]">
              No terminal profiles configured yet.
            </p>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {profiles.map((profile) => (
                <article
                  key={profile.id}
                  className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold">{profile.name}</h3>
                        <span className="rounded-full bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--secondary-foreground))]">
                          {profile.platform}
                        </span>
                        {profile.is_default ? (
                          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 break-all text-sm text-[hsl(var(--muted-foreground))]">
                        {profile.command}
                      </p>
                    </div>

                    <label className="inline-flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={profile.is_default}
                        disabled={defaultMutation.isPending}
                        onChange={() => {
                          void handleSetDefault(profile);
                        }}
                        className="h-4 w-4 rounded border-[hsl(var(--input))]"
                      />
                      Default
                    </label>
                  </div>

                  <div className="mt-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">
                      Args Template
                    </p>
                    <p className="mt-2 break-all text-sm text-[hsl(var(--foreground))]">
                      {profile.args_template}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openEditForm(profile)}
                      className={buttonClassName}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDelete(profile);
                      }}
                      className="inline-flex items-center justify-center rounded-xl border border-red-500/40 px-4 py-2 text-sm font-medium text-red-500 transition hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {detectedProfiles.length > 0 ? (
          <section className={sectionClassName}>
            <h2 className="text-lg font-semibold">Detected Terminals</h2>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {detectedProfiles.map((profile) => {
                const terminalKey = buildTerminalKey(profile);
                const alreadyAdded = knownDetectedKeys.has(terminalKey);

                return (
                  <article
                    key={terminalKey}
                    className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold">{profile.name}</h3>
                        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                          {profile.platform}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={alreadyAdded || createMutation.isPending}
                        onClick={() => {
                          void handleAddDetected(profile);
                        }}
                        className={buttonClassName}
                      >
                        {alreadyAdded ? "Added" : "Add"}
                      </button>
                    </div>
                    <p className="mt-4 break-all text-sm text-[hsl(var(--muted-foreground))]">
                      {profile.command}
                    </p>
                    <p className="mt-2 break-all text-sm text-[hsl(var(--foreground))]">
                      {profile.args_template}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      {isFormOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            if (!isSubmitting) {
              closeForm();
            }
          }}
        >
          <div
            className="w-full max-w-2xl rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold">
                  {editingProfile ? "Edit Terminal Profile" : "Add Terminal Profile"}
                </h2>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  Configure the launcher command and argument template.
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                disabled={isSubmitting}
                className={buttonClassName}
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
              <fieldset disabled={isSubmitting} className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium" htmlFor="profile-name">
                      Name
                    </label>
                    <input
                      id="profile-name"
                      required
                      value={draft.name}
                      onChange={(event) =>
                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          name: event.target.value,
                        }))
                      }
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium" htmlFor="profile-platform">
                      Platform
                    </label>
                    <select
                      id="profile-platform"
                      value={draft.platform}
                      onChange={(event) =>
                        setDraft((currentDraft) => ({
                          ...currentDraft,
                          platform: event.target.value,
                        }))
                      }
                      className={inputClassName}
                    >
                      <option value="linux">Linux</option>
                      <option value="windows">Windows</option>
                      <option value="macos">macOS</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="profile-command">
                    Command
                  </label>
                  <input
                    id="profile-command"
                    required
                    value={draft.command}
                    onChange={(event) =>
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        command: event.target.value,
                      }))
                    }
                    className={inputClassName}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium" htmlFor="profile-args-template">
                    Args Template
                  </label>
                  <textarea
                    id="profile-args-template"
                    required
                    rows={4}
                    value={draft.args_template}
                    onChange={(event) =>
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        args_template: event.target.value,
                      }))
                    }
                    className={inputClassName}
                  />
                  <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                    Use <code>{"{{SSH_COMMAND}}"}</code> to inject the generated SSH command.
                  </p>
                </div>

                <label className="inline-flex items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={draft.is_default}
                    onChange={(event) =>
                      setDraft((currentDraft) => ({
                        ...currentDraft,
                        is_default: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-[hsl(var(--input))]"
                  />
                  Set as default for this platform
                </label>
              </fieldset>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[hsl(var(--border))] pt-4">
                <button type="button" onClick={closeForm} className={buttonClassName}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-xl bg-[hsl(var(--primary))] px-5 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting
                    ? "Saving..."
                    : editingProfile
                      ? "Save Changes"
                      : "Create Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildTerminalKey(profile: {
  name: string;
  platform: string;
  command: string;
  args_template: string;
}) {
  return [
    profile.name.trim().toLowerCase(),
    profile.platform.trim().toLowerCase(),
    profile.command.trim().toLowerCase(),
    profile.args_template.trim(),
  ].join("|");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Something went wrong while managing terminal profiles.";
}
