import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({selector:'app-pagination-controls',standalone:true,templateUrl:'./pagination-controls.html',styleUrl:'./pagination-controls.scss',changeDetection:ChangeDetectionStrategy.OnPush})
export class PaginationControls {
  readonly page=input.required<number>();readonly totalPages=input.required<number>();readonly pageChange=output<number>();
  readonly visiblePages=computed(()=>{const start=Math.floor((this.page()-1)/5)*5+1;const end=Math.min(start+4,this.totalPages());return Array.from({length:end-start+1},(_,index)=>start+index);});
  goTo(page:number):void{this.pageChange.emit(Math.min(Math.max(1,page),this.totalPages()));}
  manual(event:Event):void{const input=event.target as HTMLInputElement;const value=Number(input.value);if(Number.isInteger(value)&&value>=1&&value<=this.totalPages()){this.goTo(value);input.value='';}}
}
