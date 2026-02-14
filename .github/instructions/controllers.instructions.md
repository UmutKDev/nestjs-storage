---
applyTo: 'src/modules/**/*.controller.ts'
---

# Controller Conventions

## Structure

```typescript
@Controller('ModuleName')
@ApiTags('ModuleName')
@ApiCookieAuth()
export class ModuleNameController {
  constructor(private readonly moduleNameService: ModuleNameService) {}

  @Get('ActionName')
  @ApiOperation({
    summary: 'Short description',
    description: 'Detailed description',
  })
  @ApiSuccessResponse(ActionResponseModel)
  async ActionName(
    @Query() model: ActionRequestModel,
    @User() user: UserContext,
  ): Promise<ActionResponseModel> {
    return this.moduleNameService.ActionName(model, user);
  }
}
```

## Key Rules

- Route paths are PascalCase: `@Get('List')`, `@Post('Upload')`, not `@Get('list')`.
- Use `@ApiSuccessResponse(Type)` for single-object endpoints, `@ApiSuccessArrayResponse(Type)` for lists.
- Never return the wrapper `{ Result, Status }` manually — `TransformInterceptor` handles it.
- All routes require auth by default. Add `@Public()` only for unauthenticated routes.
- File uploads use `@UseInterceptors(FileInterceptor('File'))` with `@ParseFilePipe` validators.
- Rate limiting: define a throttle config object and apply via `@Throttle(config)`.
- For streaming responses (downloads), inject `@Res() res: Response` and pipe manually.
