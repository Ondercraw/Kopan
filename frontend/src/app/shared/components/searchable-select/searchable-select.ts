import { ChangeDetectionStrategy, Component, ElementRef, HostListener, effect, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SearchableSelectOption { value:string; label:string; meta?:string; }

@Component({
  selector:'app-searchable-select', standalone:true,
  templateUrl:'./searchable-select.html', styleUrl:'./searchable-select.scss',
  providers:[{provide:NG_VALUE_ACCESSOR,useExisting:forwardRef(()=>SearchableSelect),multi:true}],
  changeDetection:ChangeDetectionStrategy.OnPush,
})
export class SearchableSelect implements ControlValueAccessor {
  private readonly element=inject(ElementRef<HTMLElement>);
  readonly options=input.required<SearchableSelectOption[]>();
  readonly placeholder=input('Buscar…');
  readonly emptyText=input('No hay opciones que coincidan.');
  readonly allowCustom=input(false);
  readonly clearable=input(true);
  readonly open=signal(false);readonly query=signal('');readonly disabled=signal(false);readonly selectedValue=signal('');
  private readonly syncWhenOptionsChange=effect(()=>{this.options();if(!this.open())this.syncLabel();});
  private onChange:(value:string)=>void=()=>{};private onTouched:()=>void=()=>{};

  filteredOptions():SearchableSelectOption[]{const term=this.normalize(this.query());if(!term||term===this.normalize(this.selectedLabel()))return this.options();return this.options().filter(option=>this.normalize(`${option.label} ${option.meta??''}`).includes(term));}
  writeValue(value:string|null):void{this.selectedValue.set(value??'');this.syncLabel();}
  registerOnChange(fn:(value:string)=>void):void{this.onChange=fn;}
  registerOnTouched(fn:()=>void):void{this.onTouched=fn;}
  setDisabledState(value:boolean):void{this.disabled.set(value);}
  onInput(event:Event):void{const text=(event.target as HTMLInputElement).value;this.query.set(text);this.open.set(true);if(this.allowCustom()){this.selectedValue.set(text);this.onChange(text);}else if(text!==this.selectedLabel()){this.selectedValue.set('');this.onChange('');}}
  select(option:SearchableSelectOption):void{this.selectedValue.set(option.value);this.query.set(option.label);this.onChange(option.value);this.onTouched();this.open.set(false);}
  clear():void{this.selectedValue.set('');this.query.set('');this.onChange('');this.onTouched();this.open.set(false);}
  toggle():void{if(!this.disabled())this.open.update(value=>!value);}
  touch():void{this.onTouched();}
  selectedLabel():string{const value=this.selectedValue();return this.options().find(option=>option.value===value)?.label??(this.allowCustom()?value:'');}
  trackOption(_:number,option:SearchableSelectOption):string{return option.value;}
  @HostListener('document:mousedown',['$event']) closeOutside(event:MouseEvent):void{if(!this.element.nativeElement.contains(event.target))this.open.set(false);}
  private syncLabel():void{this.query.set(this.selectedLabel());}
  private normalize(value:string):string{return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
}
