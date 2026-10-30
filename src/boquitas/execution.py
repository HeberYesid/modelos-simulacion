"""Cooperative execution cancellation and wall-time limits.

Execution scopes are request-local. Simulation code can call :func:`check_execution`
without depending on the API layer, and standalone simulations remain unaffected.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar, Token
from threading import Event
from time import monotonic


class ExecutionCancelled(Exception):
    """Raised when a caller requests cancellation of the active execution."""


class ExecutionTimedOut(Exception):
    """Raised when the active execution exceeds its wall-time deadline."""


class ExecutionControl:
    """Thread-safe cancellation signal and monotonic execution deadline."""

    def __init__(
        self,
        timeout_s: float = 60.0,
        *,
        deadline: float | None = None,
        cancel: Event | None = None,
    ) -> None:
        self.cancel = cancel if cancel is not None else Event()
        self.deadline = deadline if deadline is not None else monotonic() + timeout_s

    @property
    def cancel_event(self) -> Event:
        """Alias spelling out the type and role of :attr:`cancel`."""

        return self.cancel


_current_execution: ContextVar[ExecutionControl | None] = ContextVar(
    "boquitas_execution_control", default=None
)


@contextmanager
def execution_scope(control: ExecutionControl) -> Iterator[None]:
    """Make ``control`` visible to checkpoints in the current execution context."""

    token: Token[ExecutionControl | None] = _current_execution.set(control)
    try:
        yield
    finally:
        _current_execution.reset(token)


def check_execution() -> None:
    """Raise for cancellation or timeout; do nothing outside a request scope."""

    control = _current_execution.get()
    if control is None:
        return
    if control.cancel.is_set():
        raise ExecutionCancelled("execution was cancelled")
    if monotonic() >= control.deadline:
        raise ExecutionTimedOut("execution exceeded its wall-time limit")
