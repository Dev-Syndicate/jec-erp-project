// Create-department dialog. Super Admin only (the console gates on that; the
// API re-checks). Controlled open state so we can close it on success.
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
import { useCreateDepartment } from "@/features/departments/hooks/use-departments";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Couldn't create the department.";
}

export function CreateDepartmentDialog() {
  const create = useCreateDepartment();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  function reset() {
    setName("");
    setCode("");
    create.reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm">New department</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New department</DialogTitle>
          <DialogDescription>
            Departments hold classes, staff, and students. Only a Super Admin can create them.
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-department"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              { name, code },
              { onSuccess: () => setOpen(false) },
            );
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
          {create.isError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage(create.error)}
            </p>
          )}
        </form>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" form="create-department" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create department"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
