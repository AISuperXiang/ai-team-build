# Domain Packs

`domain-packs/` 保存可复用垂直领域团队包。每个 pack 不是完整生成物，而是工厂选择和合成 `team-spec.json` 的领域种子。

每个 pack 必须包含：

- `domain-pack.json`：领域包元数据、关键词、推荐 spec、能力、门禁和产物。
- 可选参考材料：方法论、样例输入、验收说明。

当前内置 pack：

- `stock-trading`：A 股投资研究与交易计划辅助团队。
- `product-rd`：产品研发交付团队。
- `venture-building`：从零创业、客户发现、GTM、runway 与运营交付团队。

校验：

```bash
npm run validate:domain-packs
```

从自然语言目标合成规格：

```bash
npm run spec -- --goal "创建一个A股趋势研究团队" --output .tmp/stock-spec.json
```
