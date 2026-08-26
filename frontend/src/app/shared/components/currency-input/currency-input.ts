import { ChangeDetectionStrategy, Component, forwardRef, Input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-currency-input',
  standalone: true,
  templateUrl: './currency-input.html',
  styleUrl: './currency-input.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CurrencyInput), multi: true },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CurrencyInput implements ControlValueAccessor {
  @Input() inputId = '';
  @Input() placeholder = '0';
  @Input() ariaLabel = 'Importe en pesos argentinos';
  displayValue = '';
  @Input() disabled = false;
  private onChange: (value: number) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: number | null | undefined): void {
    const normalized = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
    const [integer, decimals] = normalized.toFixed(2).split('.');
    this.displayValue = `${this.formatInteger(Number(integer))}${Number(decimals) ? `,${decimals.replace(/0$/, '')}` : ''}`;
  }
  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
  }
  handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/\./g, '').replace(/[^\d,]/g, '');
    const [integerPart = '', ...decimalParts] = cleaned.split(',');
    const decimals = decimalParts.join('').slice(0, 2);
    const integer = Number(integerPart || 0);
    const value = integer + (decimals ? Number(decimals) / 10 ** decimals.length : 0);
    this.displayValue = this.formatInteger(integer) + (cleaned.includes(',') ? `,${decimals}` : '');
    input.value = this.displayValue;
    this.onChange(value);
  }
  blur(): void {
    this.onTouched();
  }
  private formatInteger(value: number): string {
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
  }
}
