import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PaymentStatus,
  VALID_TRANSITIONS,
  canTransition,
  assertValidTransition,
  transitionTransaction,
} from "../src/services/paymentStateMachine.js";
import { ApiError } from "../src/utils/ApiError.js";
import mongoose from "mongoose";

describe("Payment State Machine - Unit Rules & Transition Constraints", () => {
  it("should define all five canonical uppercase states", () => {
    assert.equal(PaymentStatus.PENDING, "PENDING");
    assert.equal(PaymentStatus.PROCESSING, "PROCESSING");
    assert.equal(PaymentStatus.SUCCEEDED, "SUCCEEDED");
    assert.equal(PaymentStatus.FAILED, "FAILED");
    assert.equal(PaymentStatus.REVERSED, "REVERSED");
  });

  it("should allow valid PENDING -> PROCESSING transition", () => {
    assert.equal(canTransition(PaymentStatus.PENDING, PaymentStatus.PROCESSING), true);
    assert.doesNotThrow(() => {
      assertValidTransition(PaymentStatus.PENDING, PaymentStatus.PROCESSING);
    });
  });

  it("should allow valid PROCESSING -> SUCCEEDED transition", () => {
    assert.equal(canTransition(PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED), true);
    assert.doesNotThrow(() => {
      assertValidTransition(PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED);
    });
  });

  it("should allow valid PROCESSING -> FAILED transition", () => {
    assert.equal(canTransition(PaymentStatus.PROCESSING, PaymentStatus.FAILED), true);
    assert.doesNotThrow(() => {
      assertValidTransition(PaymentStatus.PROCESSING, PaymentStatus.FAILED);
    });
  });

  it("should allow valid SUCCEEDED -> REVERSED transition", () => {
    assert.equal(canTransition(PaymentStatus.SUCCEEDED, PaymentStatus.REVERSED), true);
    assert.doesNotThrow(() => {
      assertValidTransition(PaymentStatus.SUCCEEDED, PaymentStatus.REVERSED);
    });
  });

  it("should reject invalid SUCCEEDED -> PENDING transition with ApiError(400)", () => {
    assert.equal(canTransition(PaymentStatus.SUCCEEDED, PaymentStatus.PENDING), false);
    assert.throws(
      () => assertValidTransition(PaymentStatus.SUCCEEDED, PaymentStatus.PENDING),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /Invalid payment status transition from SUCCEEDED to PENDING/);
        return true;
      }
    );
  });

  it("should reject invalid FAILED -> SUCCEEDED transition with ApiError(400)", () => {
    assert.equal(canTransition(PaymentStatus.FAILED, PaymentStatus.SUCCEEDED), false);
    assert.throws(
      () => assertValidTransition(PaymentStatus.FAILED, PaymentStatus.SUCCEEDED),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /Invalid payment status transition from FAILED to SUCCEEDED/);
        return true;
      }
    );
  });

  it("should reject invalid REVERSED -> SUCCEEDED transition with ApiError(400)", () => {
    assert.equal(canTransition(PaymentStatus.REVERSED, PaymentStatus.SUCCEEDED), false);
    assert.throws(
      () => assertValidTransition(PaymentStatus.REVERSED, PaymentStatus.SUCCEEDED),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /Invalid payment status transition from REVERSED to SUCCEEDED/);
        return true;
      }
    );
  });

  it("should reject invalid REVERSED -> PROCESSING transition (terminal state)", () => {
    assert.equal(canTransition(PaymentStatus.REVERSED, PaymentStatus.PROCESSING), false);
    assert.throws(
      () => assertValidTransition(PaymentStatus.REVERSED, PaymentStatus.PROCESSING),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  it("should reject invalid PENDING -> SUCCEEDED transition (cannot skip PROCESSING)", () => {
    assert.equal(canTransition(PaymentStatus.PENDING, PaymentStatus.SUCCEEDED), false);
    assert.throws(
      () => assertValidTransition(PaymentStatus.PENDING, PaymentStatus.SUCCEEDED),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  it("should reject invalid PENDING -> FAILED transition directly", () => {
    assert.equal(canTransition(PaymentStatus.PENDING, PaymentStatus.FAILED), false);
    assert.throws(
      () => assertValidTransition(PaymentStatus.PENDING, PaymentStatus.FAILED),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  it("should enforce FAILED as terminal state with zero outgoing transitions", () => {
    assert.deepEqual(VALID_TRANSITIONS[PaymentStatus.FAILED], []);
  });

  it("should enforce REVERSED as terminal state with zero outgoing transitions", () => {
    assert.deepEqual(VALID_TRANSITIONS[PaymentStatus.REVERSED], []);
  });

  it("should return false when checking null or undefined states", () => {
    assert.equal(canTransition(null, PaymentStatus.PROCESSING), false);
    assert.equal(canTransition(PaymentStatus.PENDING, null), false);
    assert.equal(canTransition(undefined, undefined), false);
  });
});

describe("Payment State Machine - transitionTransaction Guard Validation", () => {
  it("should reject invalid transitions immediately without performing database queries", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await assert.rejects(
      async () => {
        await transitionTransaction(fakeId, PaymentStatus.FAILED, PaymentStatus.SUCCEEDED);
      },
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /Invalid payment status transition/);
        return true;
      }
    );
  });
});
