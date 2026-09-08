"use client";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import {
  createMemberSchema,
  resetPasswordSchema,
  memberRoleSchema,
} from "@/shared/forms";
import { Select } from "./Select";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { FormInput, FormError } from "./FormInput";
export function CreateMemberForm({
  passwordEnabled,
  saved,
  notify,
}: {
  passwordEnabled: boolean;
  saved: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const { t } = useI18n();
  const form = useForm({
    resolver: zodResolver(createMemberSchema),
    defaultValues: { name: "", username: "", password: "" },
  });
  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="space-y-5 pt-5"
        onSubmit={form.handleSubmit(async (values) => {
          form.clearErrors("root");
          try {
            await api("/admin/users", values);
            form.reset();
            await saved();
            notify(
              "Teammate added. They will change their temporary password on first login.",
            );
          } catch (error) {
            form.setError("root", { message: (error as Error).message });
          }
        })}
      >
        <FormInput
          name="name"
          label={t("Name")}
          required
          maxLength={40}
          autoComplete="off"
        />
        <FormInput
          name="username"
          label={t("Username")}
          required
          maxLength={30}
          autoComplete="off"
          description={t("Use 3–30 letters, numbers or underscores.")}
        />
        <FormInput
          name="password"
          label={t("Temporary password")}
          type="password"
          required
          maxLength={128}
          autoComplete="new-password"
          description={t("Use 12–128 characters.")}
        />
        <FormError />
        <Button
          type="submit"
          className="primary"
          disabled={form.formState.isSubmitting || !passwordEnabled}
        >
          {t("Create account")}
          <Plus size={16} />
        </Button>
      </form>
    </FormProvider>
  );
}
export function MemberActionForm({
  action,
  onCancel,
  saved,
  notify,
}: {
  action: { kind: "delete" | "reset"; user: { id: string; name: string } };
  onCancel: () => void;
  saved: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const { t } = useI18n();
  const form = useForm({
    resolver: zodResolver(
      action.kind === "reset"
        ? resetPasswordSchema
        : z.object({ password: z.string() }),
    ),
    defaultValues: { password: "" },
  });
  const busy = form.formState.isSubmitting;
  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="member-action-form space-y-4"
        aria-label={t(
          action.kind === "delete" ? "Delete member" : "Reset password",
        )}
        onSubmit={form.handleSubmit(async ({ password }) => {
          form.clearErrors("root");
          try {
            if (action.kind === "delete")
              await api(`/admin/users/${action.user.id}`, undefined, "DELETE");
            else
              await api("/admin/reset-password", {
                userId: action.user.id,
                password,
              });
            form.reset();
            await saved();
            notify(
              action.kind === "delete"
                ? "Member deleted."
                : "Password reset. Give the temporary password to the member; they must change it on their next login.",
            );
          } catch (error) {
            form.setError("root", { message: (error as Error).message });
          }
        })}
      >
        <strong>{action.user.name}</strong>
        <p>
          {t(
            action.kind === "delete"
              ? "Delete this member and sign them out? This cannot be undone. Their SSO identity is not deleted; signing in again requires approval."
              : "Set a temporary password with at least 12 characters. The member will be signed out and must change it on their next login.",
          )}
        </p>
        {action.kind === "reset" && (
          <FormInput
            name="password"
            label={t("Temporary password")}
            type="password"
            required
            maxLength={128}
            autoComplete="new-password"
            disabled={busy}
          />
        )}
        <FormError />
        <div className="member-actions">
          <Button
            variant="link"
            className="text-button"
            disabled={busy}
            onClick={onCancel}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            variant={action.kind === "delete" ? "destructive" : "default"}
            className="primary"
            disabled={busy}
          >
            {t(
              action.kind === "delete" ? "Confirm deletion" : "Reset password",
            )}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

export function MemberRoleForm({
  user,
  onCancel,
  saved,
}: {
  user: { id: string; name: string; role: string };
  onCancel: () => void;
  saved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const form = useForm({
    resolver: zodResolver(memberRoleSchema),
    defaultValues: {
      role: user.role === "owner" ? ("owner" as const) : ("member" as const),
    },
  });
  const busy = form.formState.isSubmitting;
  return (
    <FormProvider {...form}>
      <form
        className="member-action-form space-y-4"
        aria-label={t("Change role")}
        onSubmit={form.handleSubmit(async (values) => {
          form.clearErrors("root");
          try {
            await api(`/admin/users/${user.id}/role`, values, "PATCH");
            await saved();
          } catch (error) {
            form.setError("root", { message: (error as Error).message });
          }
        })}
      >
        <strong>{user.name}</strong>
        <p>
          {t(
            "Owners can manage members, settings and activity logs. Members can use the office without administration access.",
          )}
        </p>
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Select
              label={t("Role")}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={busy}
              options={[
                { value: "member", label: t("member") },
                { value: "owner", label: t("owner") },
              ]}
            />
          )}
        />
        <FormError />
        <div className="member-actions">
          <Button variant="link" disabled={busy} onClick={onCancel}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={busy || !form.formState.isDirty}>
            {t("Save role")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
