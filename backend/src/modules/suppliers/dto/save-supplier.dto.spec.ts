import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveSupplierDto } from './save-supplier.dto';

describe('SaveSupplierDto', () => {
  it('permite crear un proveedor solamente con el nombre', async () => {
    const dto = plainToInstance(SaveSupplierDto, {
      nombre: 'Proveedor de prueba',
      email: '',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBeUndefined();
  });

  it('continua rechazando un email informado con formato invalido', async () => {
    const dto = plainToInstance(SaveSupplierDto, {
      nombre: 'Proveedor de prueba',
      email: 'correo-invalido',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
