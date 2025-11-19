import { Public } from '@common/decorators/public.decorator';
import { ApiSuccessResponse } from '@common/decorators/response.decorator';
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@Controller()
@Public()
@ApiTags('Home')
export class CoreController {
  quotes: { id: number; quote: string }[];
  constructor() {
    this.quotes = [
      {
        id: 1,
        quote: 'May the Force be with you.',
      },
      {
        id: 2,
        quote: 'I find your lack of faith disturbing.',
      },
      {
        id: 3,
        quote: 'I am your father.',
      },
      {
        id: 4,
        quote: 'Do or do not. There is no try.',
      },
      {
        id: 5,
        quote: 'It’s a trap!',
      },
      {
        id: 6,
        quote: 'I’ve got a bad feeling about this.',
      },
      {
        id: 7,
        quote: 'The Force will be with you, always.',
      },
      {
        id: 8,
        quote: 'I’ll never turn to the dark side.',
      },
      {
        id: 9,
        quote: 'Fear is the path to the dark side.',
      },
    ];
  }

  @Get()
  @ApiSuccessResponse('string')
  Home(): string {
    const randomQuote =
      this.quotes[Math.floor(Math.random() * this.quotes.length)];
    return randomQuote.quote;
  }
}
