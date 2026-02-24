import { PureAbility } from '@casl/ability';
import { CaslAction, CaslSubject } from '@common/enums';

export type AppAbility = PureAbility<[CaslAction, CaslSubject]>;

export interface IPolicyHandler {
  Handle(Ability: AppAbility): boolean;
}

export type PolicyHandlerCallback = (Ability: AppAbility) => boolean;
export type PolicyHandler = IPolicyHandler | PolicyHandlerCallback;
