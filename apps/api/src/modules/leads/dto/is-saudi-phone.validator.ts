import {
  registerDecorator,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { isSaudiPhone } from '@packvio/shared';

/**
 * Validates a Saudi mobile number using the SHARED normaliser.
 *
 * The rule deliberately lives in packages/shared and not in a regex here: the
 * RFQ form validates in the browser before it submits, and a number the form
 * accepts but this decorator rejects loses the lead at the final click. One
 * implementation, imported by both, cannot drift.
 */
@ValidatorConstraint({ name: 'isSaudiPhone', async: false })
export class IsSaudiPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isSaudiPhone(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a Saudi mobile number, e.g. +966 59 481 6791 or 0594816791`;
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- decorator factories are PascalCase
export function IsSaudiPhoneNumber(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      constraints: [],
      validator: IsSaudiPhoneConstraint,
    });
  };
}
