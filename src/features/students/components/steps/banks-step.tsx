// Banks step — repeatable bank accounts. Add as many as needed; each needs a
// name, holder, account number and IFSC (the other fields are optional). The
// step itself is optional (zero banks is valid). Saved as a set (replace-all).
"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSaveBanks } from "@/features/students/hooks/use-students";
import type { BankInput, StudentDetail } from "@/features/students/types";
import { Field, LookupSelect, SaveBar } from "@/features/students/components/steps/step-ui";

const ACCOUNT_TYPES = ["Savings", "Current"];

function emptyBank(): BankInput {
  return { bankName: "", accountHolder: "", accountNo: "", ifscCode: "", type: "", branch: "" };
}

function initialBanks(student: StudentDetail | undefined): BankInput[] {
  const rows = student?.banks ?? [];
  return rows.map((b) => ({
    bankName: b.bankName,
    accountHolder: b.accountHolder,
    accountNo: b.accountNo,
    ifscCode: b.ifscCode,
    type: b.type ?? "",
    branch: b.branch ?? "",
  }));
}

export function BanksStep({
  studentId,
  student,
}: {
  studentId: string;
  student: StudentDetail | undefined;
}) {
  const save = useSaveBanks(studentId);
  const [banks, setBanks] = useState<BankInput[]>(() => initialBanks(student));
  const [saved, setSaved] = useState(false);

  const add = () => {
    setBanks((bs) => [...bs, emptyBank()]);
    setSaved(false);
  };
  const remove = (i: number) => {
    setBanks((bs) => bs.filter((_, j) => j !== i));
    setSaved(false);
  };
  const patch = (i: number, p: Partial<BankInput>) => {
    setBanks((bs) => bs.map((b, j) => (j === i ? { ...b, ...p } : b)));
    setSaved(false);
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(banks, { onSuccess: () => setSaved(true) });
      }}
    >
      {banks.length === 0 && (
        <p className="text-sm text-muted-foreground">No bank accounts yet. Add one below.</p>
      )}

      <div className="flex flex-col gap-4">
        {banks.map((b, i) => (
          <fieldset key={i} className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <legend className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
                Bank · {i + 1}
              </legend>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove this bank"
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Bank name">
                <Input value={b.bankName} onChange={(e) => patch(i, { bankName: e.target.value })} className="h-10" required />
              </Field>
              <Field label="Account holder">
                <Input value={b.accountHolder} onChange={(e) => patch(i, { accountHolder: e.target.value })} className="h-10" required />
              </Field>
              <Field label="Account number">
                <Input value={b.accountNo} onChange={(e) => patch(i, { accountNo: e.target.value })} className="h-10" required inputMode="numeric" />
              </Field>
              <Field label="IFSC code">
                <Input value={b.ifscCode} onChange={(e) => patch(i, { ifscCode: e.target.value.toUpperCase() })} className="h-10" required placeholder="SBIN0001234" />
              </Field>
              <Field label="Account type" optional>
                <LookupSelect
                  value={b.type}
                  onChange={(v) => patch(i, { type: v })}
                  options={ACCOUNT_TYPES.map((t) => ({ id: t, name: t }))}
                  placeholder="Savings / Current"
                />
              </Field>
              <Field label="Branch" optional>
                <Input value={b.branch} onChange={(e) => patch(i, { branch: e.target.value })} className="h-10" />
              </Field>
            </div>
          </fieldset>
        ))}
      </div>

      <div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="size-4" />
          Add bank
        </Button>
      </div>

      <SaveBar pending={save.isPending} saved={saved} error={save.error} label="Save banks" />
    </form>
  );
}
