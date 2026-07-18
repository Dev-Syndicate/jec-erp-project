// Create/edit department dialog. Super Admin only (console gates; API re-checks).
// One component for both modes — edit prefills from the passed department and
// PATCHes; create starts blank and POSTs.
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useCreateDepartment,
  useUpdateDepartment,
} from "@/features/departments/hooks/use-departments";
import type { Department } from "@/features/departments/types";

// Create mode: renders its own trigger button, manages open state internally.
// Edit mode: controlled by the parent via open/onOpenChange (opened from a menu
// item, which can't itself be a dialog trigger).
type Props =
  | { mode: "create"; department?: undefined; open?: undefined; onOpenChange?: undefined }
  | {
      mode: "edit";
      department: Department;
      open: boolean;
      onOpenChange: (open: boolean) => void;
    };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export function DepartmentDialog({ mode, department, open: openProp, onOpenChange }: Props) {
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const pending = create.isPending || update.isPending;
  const error = create.error || update.error;

  const [openState, setOpenState] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openState;
  const setOpen = (next: boolean) => (isControlled ? onOpenChange!(next) : setOpenState(next));

  const [name, setName] = useState(department?.name ?? "");
  const [code, setCode] = useState(department?.code ?? "");

  function resetToInitial() {
    setName(department?.name ?? "");
    setCode(department?.code ?? "");
    create.reset();
    update.reset();
  }

  function submit() {
    if (mode === "edit") {
      update.mutate({ id: department.id, name, code }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate({ name, code }, { onSuccess: () => setOpen(false) });
    }
  }

  const isEdit = mode === "edit";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetToInitial();
      }}
    >
      {mode === "create" && (
        <DialogTrigger render={<Button size="sm">New department</Button>} />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit department" : "New department"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the name or code. Members and classes stay attached."
              : "Departments hold classes, staff, and students. Only a Super Admin can create them."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="department-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="dept-name">Name</Label>
            <Input
              id="dept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Computer Science & Engineering"
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dept-code">Code</Label>
            <Input
              id="dept-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="CSE"
              autoCapitalize="characters"
              className="h-10 uppercase"
            />
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage(error)}
            </p>
          )}
        </form>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" form="department-form" disabled={pending}>
            {pending
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save changes"
                : "Create department"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
