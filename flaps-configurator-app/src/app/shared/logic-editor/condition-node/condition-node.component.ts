import { NgTemplateOutlet } from '@angular/common';
import { Component, input, output } from '@angular/core';
import {
  IonButton,
  IonInput,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular';
import { COMPARE_TYPES, CompareType } from '../../../core/condition';
import { ConditionNodeType } from '../../../core/protocol/gen/flaps_logic_pb';
import { SignalName } from '../../logic-format';
import { EditNode, negate, newCompare, newGroup } from './condition-edit';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/**
 * Element warunku logiki: porównanie sygnału (także histereza), grupa I / LUB albo NIE — z czasem
 * „przez”.
 * Rekurencyjny; zmiany oddaje w górę jako nowy element (`changed`) albo `removed`.
 */
@Component({
  selector: 'app-condition-node',
  templateUrl: './condition-node.component.html',
  styleUrls: ['./condition-node.component.scss'],
  imports: [
    NgTemplateOutlet,
    TranslatePipe,
    IonButton,
    IonInput,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
  ],
})
export class ConditionNodeComponent {
  readonly node = input.required<EditNode>();
  readonly signals = input.required<readonly SignalName[]>();
  /** Korzeń warunku — nie da się go usunąć ani zanegować. */
  readonly root = input(false);

  readonly changed = output<EditNode>();
  readonly removed = output<void>();

  protected readonly compareTypes = COMPARE_TYPES;

  /** Histereza ma dwa progi — pomiędzy wynik się nie zmienia. */
  protected isHysteresis(node: EditNode): boolean {
    return node.kind === 'compare' && node.type === ConditionNodeType.CONDITION_NODE_HYSTERESIS;
  }

  protected update(change: Partial<EditNode>): void {
    this.changed.emit({ ...this.node(), ...change } as EditNode);
  }

  protected text(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  protected onSignal(value: unknown): void {
    this.update({ signal: typeof value === 'number' ? value : null });
  }

  protected onCompareType(value: unknown): void {
    if (COMPARE_TYPES.some((c) => c.value === value)) {
      this.update({ type: value as CompareType });
    }
  }

  protected onOp(value: unknown): void {
    if (value === 'and' || value === 'or') {
      this.update({ op: value });
    }
  }

  protected setChild(index: number, child: EditNode): void {
    const node = this.node();
    if (node.kind === 'group') {
      this.update({ children: node.children.map((c, i) => (i === index ? child : c)) });
    } else if (node.kind === 'not') {
      this.update({ child });
    }
  }

  protected removeChild(index: number): void {
    const node = this.node();
    if (node.kind === 'group') {
      this.update({ children: node.children.filter((_, i) => i !== index) });
    }
  }

  protected addCompare(): void {
    const node = this.node();
    if (node.kind === 'group') {
      this.update({
        children: [...node.children, newCompare(this.signals().length > 0 ? 0 : null)],
      });
    }
  }

  /** Podgrupa z przeciwnym operatorem — np. LUB w I. */
  protected addGroup(): void {
    const node = this.node();
    if (node.kind === 'group') {
      const signal = this.signals().length > 0 ? 0 : null;
      const group = newGroup(node.op === 'and' ? 'or' : 'and', [
        newCompare(signal),
        newCompare(signal),
      ]);
      this.update({ children: [...node.children, group] });
    }
  }

  protected negate(): void {
    this.changed.emit(negate(this.node()));
  }

  /** NIE → sam element w środku. */
  protected unwrap(): void {
    const node = this.node();
    if (node.kind === 'not') {
      this.changed.emit(node.child);
    }
  }
}
